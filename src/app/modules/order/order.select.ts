import { Prisma } from "../../../generated/prisma/client";
import { addressSnapshotSchema, componentSnapshotSchema, productSnapshotSchema, readOrderSnapshot } from "./order.snapshot";

export const orderSummarySelect = {
  id: true,
  number: true,
  customerId: true,
  source: true,
  status: true,
  version: true,
  addressSnapshot: true,
  subtotal: true,
  discount: true,
  deliveryFee: true,
  total: true,
  paymentMethod: true,
  paidAt: true,
  expiresAt: true,
  deliveredAt: true,
  createdAt: true,
} satisfies Prisma.OrderSelect;

export const orderDetailInclude = {
  lines: {
    orderBy: { id: "asc" },
    include: { components: { orderBy: { id: "asc" } } },
  },
  history: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
} satisfies Prisma.OrderInclude;

export const adminOrderDetailInclude = {
  ...orderDetailInclude,
  history: {
    ...orderDetailInclude.history,
    include: { actor: { select: { name: true, email: true } } },
  },
} satisfies Prisma.OrderInclude;

export type OrderHistoryActor = { name: string; email: string };
type StoredOrderDetail = Prisma.OrderGetPayload<{
  include: typeof orderDetailInclude;
}>;
export type OrderDetail = Omit<StoredOrderDetail, "history"> & {
  history: (StoredOrderDetail["history"][number] & { actor?: OrderHistoryActor | null })[];
};

export const mapOrderSummary = (order: Prisma.OrderGetPayload<{ select: typeof orderSummarySelect }>) => {
  const { addressSnapshot, ...summary } = order;
  const { recipientName, recipientPhone } = readOrderSnapshot(addressSnapshotSchema, addressSnapshot);
  return { ...summary, recipientName, recipientPhone };
};

export const mapOrder = (order: OrderDetail, admin = false) => {
  const {
    idempotencyScope,
    idempotencyKey,
    requestHash,
    guestTokenHash,
    createdById,
    history,
    addressSnapshot,
    lines,
    ...receipt
  } = order;
  return {
    ...receipt,
    ...readOrderSnapshot(addressSnapshotSchema, addressSnapshot),
    lines: lines.map(({ productSnapshot, components, ...line }) => ({
      ...line,
      ...readOrderSnapshot(productSnapshotSchema, productSnapshot),
      components: components.map(({ productSnapshot, ...component }) => ({
        ...component,
        ...readOrderSnapshot(componentSnapshotSchema, productSnapshot),
      })),
    })),
    ...(admin ? { createdById } : {}),
    history: history.map(
      ({
        id,
        event,
        fromStatus,
        toStatus,
        createdAt,
        actorType,
        actorId,
        actor,
        reason,
      }) => ({
        id,
        event,
        fromStatus,
        toStatus,
        createdAt,
        ...(admin ? { actorType, actorId, reason, actor: actor ? { name: actor.name, email: actor.email } : null } : {}),
      }),
    ),
  };
};
