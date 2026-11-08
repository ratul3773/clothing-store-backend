import { randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma } from "../../../generated/prisma/client";
import type { ActorType, OrderStatus } from "../../../generated/prisma/enums";
import { Role } from "../../../generated/prisma/enums";
import ApiError from "../../../errors/ApiError";
import { prisma } from "../../../lib/prisma";
import { buildPaginationMeta, getPagination } from "../../../utils/pagination";
import { hashCartToken, isCartToken } from "../cart/cart.cookie";
import { addVariantDemand } from "../combo/combo.rules";
import { checkoutOrder } from "./order.checkout";
import { assertOrderTransition } from "./order.rules";
import {
  changeOrderStock,
  lockOrderVariants,
  orderTransaction,
} from "./order.repository";
import {
  mapOrder,
  orderDetailInclude,
  orderSummarySelect,
  type OrderDetail,
} from "./order.select";
import type {
  OrderListQuery,
  ReturnReceiptInput,
  TransitionInput,
} from "./order.validation";

export type OrderAccess =
  | { kind: "customer"; userId: string }
  | { kind: "guest"; token: string }
  | { kind: "admin"; userId: string }
  | { kind: "system" };

const customerWhere = (userId: string): Prisma.OrderWhereInput => ({
  customer: {
    userId,
    deletedAt: null,
    anonymizedAt: null,
    user: {
      isDeleted: false,
      deletedAt: null,
      role: Role.customer,
      emailVerified: true,
    },
  },
});

const authorize = async (
  tx: Prisma.TransactionClient,
  order: OrderDetail,
  access: OrderAccess,
) => {
  if (access.kind === "system") return;
  if (access.kind === "guest") {
    if (
      !isCartToken(access.token) ||
      !order.guestTokenHash ||
      !timingSafeEqual(
        Buffer.from(hashCartToken(access.token)),
        Buffer.from(order.guestTokenHash),
      )
    )
      throw new ApiError(404, "Order not found");
    return;
  }
  if (access.kind === "admin") {
    const admin = await tx.user.findFirst({
      where: {
        id: access.userId,
        role: Role.admin,
        isDeleted: false,
        deletedAt: null,
        emailVerified: true,
      },
      select: { id: true },
    });
    if (!admin) throw new ApiError(403, "Admin account is not active");
    return;
  }
};

const getOrder = async (id: string, access: OrderAccess) =>
  orderTransaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: {
        id,
        ...(access.kind === "customer" ? customerWhere(access.userId) : {}),
      },
      include: orderDetailInclude,
    });
    if (!order) throw new ApiError(404, "Order not found");
    await authorize(tx, order, access);
    return mapOrder(order, access.kind === "admin");
  });

const listOrders = async (
  access: Extract<OrderAccess, { kind: "admin" | "customer" }>,
  query: OrderListQuery,
) => {
  const { page, limit, skip, take } = getPagination(query);
  const where: Prisma.OrderWhereInput = {
    ...(access.kind === "customer" ? customerWhere(access.userId) : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.source ? { source: query.source } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
    ...(query.q
      ? {
          OR: [
            { number: { contains: query.q, mode: "insensitive" } },
            { recipientPhone: { contains: query.q } },
            ...(access.kind === "admin"
              ? [
                  {
                    recipientName: {
                      contains: query.q,
                      mode: "insensitive" as const,
                    },
                  },
                ]
              : []),
          ],
        }
      : {}),
  };
  const [data, total] = await prisma.$transaction(
    [
      prisma.order.findMany({
        where,
        select: orderSummarySelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take,
      }),
      prisma.order.count({ where }),
    ],
    { isolationLevel: "RepeatableRead" },
  );
  return { data, meta: buildPaginationMeta(total, page, limit) };
};

const actorFor = (
  access: OrderAccess,
): { type: ActorType; id: string | null } => ({
  type:
    access.kind === "admin"
      ? "ADMIN"
      : access.kind === "system"
        ? "SYSTEM"
        : "CUSTOMER",
  id:
    access.kind === "admin" || access.kind === "customer"
      ? access.userId
      : null,
});

const transitionLocked = async (
  tx: Prisma.TransactionClient,
  order: OrderDetail,
  status: OrderStatus,
  access: OrderAccess,
  reason?: string,
  receipt?: ReturnReceiptInput["components"],
) => {
  assertOrderTransition(order.status, status);
  const components = order.lines.flatMap((line) => line.components);
  const demand = new Map<string, number>();
  addVariantDemand(demand, components, 1);
  const actor = actorFor(access);
  if (["CANCELLED", "SHIPPED", "RETURNED"].includes(status)) {
    await lockOrderVariants(tx, [...demand.keys()]);
    if (status === "RETURNED") {
      if (!receipt || receipt.length !== components.length)
        throw new ApiError(422, "Account for every shipped component");
      const returned = new Map(receipt.map((item) => [item.id, item]));
      const sellable = new Map<string, number>();
      for (const component of components) {
        const item = returned.get(component.id);
        if (!item || item.sellable + item.damaged !== component.quantity)
          throw new ApiError(
            422,
            "Returned quantities must match shipped quantities",
          );
        sellable.set(
          component.variantId,
          (sellable.get(component.variantId) ?? 0) + item.sellable,
        );
      }
      // One batch stores the inspection; available stock only receives sellable units.
      await tx.$executeRaw(Prisma.sql`UPDATE order_components AS c
        SET "returnedSellable" = r.sellable, "returnedDamaged" = r.damaged
        FROM (VALUES ${Prisma.join(receipt.map((item) => Prisma.sql`(${item.id}::text, ${item.sellable}::int, ${item.damaged}::int)`))}) AS r(id, sellable, damaged)
        WHERE c.id = r.id`);
      await changeOrderStock(
        tx,
        [...sellable]
          .filter(([, q]) => q > 0)
          .map(([variantId, quantity]) => ({
            variantId,
            onHand: quantity,
            reserved: 0,
          })),
        order.id,
        "RETURN_RESTOCK",
        actor,
      );
    } else {
      await changeOrderStock(
        tx,
        [...demand].map(([variantId, quantity]) => ({
          variantId,
          onHand: status === "SHIPPED" ? -quantity : 0,
          reserved: -quantity,
        })),
        order.id,
        status === "SHIPPED" ? "DEDUCT" : "RELEASE",
        actor,
      );
    }
  }
  const now = new Date();
  const event = {
    id: randomUUID(),
    createdAt: now,
    event:
      access.kind === "system"
        ? "EXPIRED"
        : status === "RETURNED"
          ? "RETURN_RECEIVED"
          : "STATUS_CHANGED",
    fromStatus: order.status,
    toStatus: status,
    actorType: actor.type,
    actorId: actor.id,
    reason: reason ?? null,
  };
  const updated = await tx.order.update({
    where: { id: order.id },
    data: {
      status,
      version: { increment: 1 },
      expiresAt: null,
      ...(status === "DELIVERED" ? { paidAt: now, deliveredAt: now } : {}),
      history: { create: event },
    },
  });
  if (status === "DELIVERED" && order.customerId)
    await tx.customer.update({
      where: { id: order.customerId },
      data: { lifetimeValue: { increment: BigInt(order.total) } },
      select: { id: true },
    });
  const inspected = new Map(receipt?.map((item) => [item.id, item]));
  const lines = receipt
    ? order.lines.map((line) => ({
        ...line,
        components: line.components.map((component) => ({
          ...component,
          returnedSellable: inspected.get(component.id)!.sellable,
          returnedDamaged: inspected.get(component.id)!.damaged,
        })),
      }))
    : order.lines;
  return mapOrder(
    {
      ...updated,
      lines,
      history: [...order.history, { ...event, orderId: order.id }],
    },
    access.kind === "admin",
  );
};

const changeStatus = async (
  id: string,
  access: OrderAccess,
  input: TransitionInput | (ReturnReceiptInput & { status: "RETURNED" }),
) => {
  const result = await orderTransaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
    const order = await tx.order.findFirst({
      where: {
        id,
        ...(access.kind === "customer" ? customerWhere(access.userId) : {}),
      },
      include: orderDetailInclude,
    });
    if (!order) throw new ApiError(404, "Order not found");
    await authorize(tx, order, access);
    if (
      access.kind !== "admin" &&
      access.kind !== "system" &&
      input.status !== "CANCELLED"
    )
      throw new ApiError(403, "Only admins can fulfill orders");
    if (order.version !== input.version)
      throw new ApiError(409, "Order changed. Reload before updating.");
    if (
      order.status === "PENDING_CONFIRMATION" &&
      order.expiresAt &&
      order.expiresAt <= new Date()
    ) {
      const data = await transitionLocked(
        tx,
        order,
        "CANCELLED",
        { kind: "system" },
        "Pending order expired after 24 hours",
      );
      return { data, expired: input.status !== "CANCELLED" };
    }
    return {
      data: await transitionLocked(
        tx,
        order,
        input.status,
        access,
        input.reason,
        "components" in input ? input.components : undefined,
      ),
      expired: false,
    };
  });
  // Commit the expiration before reporting why confirmation was rejected.
  if (result.expired)
    throw new ApiError(409, "Order expired and its reservation was released");
  return result.data;
};

const expirePendingOrders = async () => {
  let processed = 0;
  // Bound each run so a backlog cannot monopolize the application pool.
  for (let batch = 0; batch < 10; batch++) {
    const count = await orderTransaction(async (tx) => {
      const ids = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM orders WHERE status = 'PENDING_CONFIRMATION' AND "expiresAt" <= ${new Date()}
        ORDER BY "expiresAt", id LIMIT 20 FOR UPDATE SKIP LOCKED
      `;
      if (!ids.length) return 0;
      const orders = await tx.order.findMany({
        where: { id: { in: ids.map((row) => row.id) } },
        select: {
          id: true,
          lines: {
            select: {
              components: { select: { variantId: true, quantity: true } },
            },
          },
        },
      });
      await lockOrderVariants(
        tx,
        orders.flatMap((order) =>
          order.lines.flatMap((line) =>
            line.components.map((c) => c.variantId),
          ),
        ),
      );
      for (const order of orders) {
        const demand = new Map<string, number>();
        addVariantDemand(
          demand,
          order.lines.flatMap((line) => line.components),
          1,
        );
        await changeOrderStock(
          tx,
          [...demand].map(([variantId, quantity]) => ({
            variantId,
            onHand: 0,
            reserved: -quantity,
          })),
          order.id,
          "RELEASE",
          { type: "SYSTEM", id: null },
        );
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: "CANCELLED",
            version: { increment: 1 },
            expiresAt: null,
            history: {
              create: {
                event: "EXPIRED",
                fromStatus: "PENDING_CONFIRMATION",
                toStatus: "CANCELLED",
                actorType: "SYSTEM",
                reason: "Pending order expired after 24 hours",
              },
            },
          },
          select: { id: true },
        });
      }
      return orders.length;
    });
    processed += count;
    if (count < 20) break;
  }
  return processed;
};

const searchCustomers = async (q: string) => {
  const phone = q.replace(/[\s()-]/g, "");
  const customers = await prisma.customer.findMany({
    where: { deletedAt: null, anonymizedAt: null, user: {
      role: "customer", emailVerified: true, isDeleted: false, deletedAt: null,
      OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } },
        ...(/^[+\d]{2,}$/.test(phone) ? [{ phone: { contains: phone } }] : [])],
    } },
    select: { id: true, user: { select: { name: true, email: true, phone: true } } },
    orderBy: { id: "asc" }, take: 20,
  });
  return customers.map(({ id, user }) => ({ id, ...user }));
};

export const OrderService = {
  searchCustomers,
  checkoutOrder,
  getOrder,
  listOrders,
  changeStatus,
  expirePendingOrders,
};
