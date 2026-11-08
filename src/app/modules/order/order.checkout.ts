import { randomUUID } from "node:crypto";
import { Prisma,} from "../../../generated/prisma/client";
import { Role } from "../../../generated/prisma/enums";
import config from "../../../config/env";
import ApiError from "../../../errors/ApiError";
import type { CartOwner } from "../cart/cart.interface";
import { lockCustomer, lockGuest, ownerWhere } from "../cart/cart.repository";
import { hashCartToken } from "../cart/cart.cookie";
import {
  getPublicCategoryIds,
  isVariantPublic,
  resolveActiveOffer,
} from "../product/catalog.rules";
import {
  addVariantDemand,
  isComboPublic,
  resolveComboSelections,
} from "../combo/combo.rules";
import {
  calculateOrderTotals,
  guestOrderToken,
  orderMoney,
  orderRequestHash,
} from "./order.rules";
import {
  changeOrderStock,
  lockOrderVariants,
  orderTransaction,
} from "./order.repository";
import { mapOrder, orderDetailInclude } from "./order.select";
import type {
  CatalogLineInput,
  CheckoutInput,
  ManualOrderInput,
  ShippingAddress,
} from "./order.validation";
import { catalogLine, shippingAddress } from "./order.validation";
import { publicUrlFor } from "../upload/storage";

const checkoutVariantSelect = (now: Date) =>
  ({
    id: true,
    productId: true,
    colorId: true,
    sku: true,
    size: true,
    isActive: true,
    onHand: true,
    reserved: true,
    color: { select: { name: true } },
    product: {
      select: {
        id: true,
        name: true,
        status: true,
        publishedAt: true,
        categoryId: true,
        regularPrice: true,
        images: {
          select: { colorId: true, provider: true, storageKey: true },
          orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
        },
        offers: {
          where: {
            isActive: true,
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          },
          select: {
            offerPrice: true,
            isActive: true,
            startsAt: true,
            endsAt: true,
          },
        },
      },
    },
  }) satisfies Prisma.VariantSelect;

const loadOrderLines = async (
  tx: Prisma.TransactionClient,
  input: CatalogLineInput[],
  now: Date,
) => {
  const variantIds = input.flatMap((line) =>
    line.type === "VARIANT"
      ? [line.variantId]
      : line.selections.map((s) => s.variantId),
  );
  const comboIds = [
    ...new Set(
      input.flatMap((line) => (line.type === "COMBO" ? [line.comboId] : [])),
    ),
  ];
  await lockOrderVariants(tx, variantIds);
  const variants = await tx.variant.findMany({
    where: { id: { in: [...new Set(variantIds)] } },
    select: checkoutVariantSelect(now),
  });
  const combos = comboIds.length
    ? await tx.combo.findMany({
        where: { id: { in: comboIds } },
        select: {
          id: true,
          name: true,
          price: true,
          isActive: true,
          startsAt: true,
          endsAt: true,
          items: {
            select: {
              id: true,
              colorId: true,
              quantity: true,
              variantIds: true,
            },
          },
        },
      })
    : [];
  const publicIds = await getPublicCategoryIds(tx);
  const byVariant = new Map(variants.map((variant) => [variant.id, variant]));
  const byCombo = new Map(combos.map((combo) => [combo.id, combo]));
  const demand = new Map<string, number>();
  const lines = input.map((line) => {
    let unitPrice: number;
    let name: string;
    let catalogId: string;
    let components: Array<{
      variantId: string;
      quantity: number;
      variant: (typeof variants)[number];
    }>;
    if (line.type === "VARIANT") {
      const variant = byVariant.get(line.variantId);
      if (!variant || !isVariantPublic(variant, publicIds, now))
        throw new ApiError(409, "A selected product is unavailable");
      unitPrice =
        resolveActiveOffer(
          variant.product.offers,
          variant.product.regularPrice,
          now,
        )?.offerPrice ?? variant.product.regularPrice;
      name = variant.product.name;
      catalogId = variant.id;
      components = [{ variantId: variant.id, quantity: 1, variant }];
    } else {
      const stored = byCombo.get(line.comboId);
      if (!stored) throw new ApiError(409, "A selected combo is unavailable");
      const combo = {
        ...stored,
        items: stored.items.map((item) => {
          const candidates = variants.filter(
            (variant) => variant.colorId === item.colorId,
          );
          return {
            ...item,
            color: {
              product: candidates[0]?.product ?? {
                id: "",
                status: "DRAFT",
                publishedAt: null,
                categoryId: "",
              },
              variants: candidates,
            },
          };
        }),
      };
      const selected = resolveComboSelections(combo, line.selections);
      if (
        !selected?.length ||
        !isComboPublic(combo, publicIds, now) ||
        selected.some((item) => !isVariantPublic(item.variant, publicIds, now))
      )
        throw new ApiError(409, "Combo selection is incomplete or unavailable");
      components = selected.map((item) => ({
        ...item,
        variant: byVariant.get(item.variantId)!,
      }));
      unitPrice = stored.price;
      name = stored.name;
      catalogId = stored.id;
    }
    orderMoney(unitPrice);
    addVariantDemand(demand, components, line.quantity);
    const snapshots = components.map(({ variant, quantity }) => {
      const images = variant.product.images;
      const image = images.find((item) => item.colorId === variant.colorId) ?? images[0];
      return {
        id: randomUUID(),
        variantId: variant.id,
        sku: variant.sku,
        productName: variant.product.name,
        imageUrl: image ? publicUrlFor(image.provider, image.storageKey) : null,
        color: variant.color.name,
        size: variant.size,
        quantity: orderMoney(quantity * line.quantity),
      };
    });
    return {
      id: randomUUID(),
      type: line.type,
      catalogId,
      name,
      quantity: line.quantity,
      unitPrice,
      imageUrl: snapshots.find((item) => item.imageUrl)?.imageUrl ?? null,
      components: snapshots,
    };
  });
  for (const [id, quantity] of demand) {
    const variant = byVariant.get(id)!;
    if (quantity > variant.onHand - variant.reserved)
      throw new ApiError(
        409,
        "Insufficient stock across selected products and combos",
      );
  }
  const subtotal = orderMoney(
    lines.reduce(
      (sum, line) => sum + orderMoney(line.unitPrice * line.quantity),
      0,
    ),
  );
  return { lines, demand, subtotal };
};

const resolveAddress = async (
  tx: Prisma.TransactionClient,
  destination: CheckoutInput["destination"],
  customerId: string | null,
): Promise<ShippingAddress> => {
  if ("address" in destination) return destination.address;
  if (!customerId)
    throw new ApiError(403, "A saved address requires a customer");
  const address = await tx.address.findFirst({
    where: { id: destination.addressId, customerId, deletedAt: null },
    select: {
      recipientName: true,
      recipientPhone: true,
      district: true,
      area: true,
      addressLine: true,
      postalCode: true,
      zone: true,
    },
  });
  if (!address) throw new ApiError(404, "Address not found");
  return shippingAddress.parse(address);
};

const activeCustomerWhere = {
  deletedAt: null,
  anonymizedAt: null,
  user: {
    isDeleted: false,
    deletedAt: null,
    emailVerified: true,
    role: "customer" as const,
  },
};

export const checkoutOrder = async (
  context: { owner: CartOwner } | { adminId: string },
  input: CheckoutInput | ManualOrderInput,
  key: string,
) => {
  const manual = "adminId" in context;
  const scope = manual
    ? `admin:${context.adminId}`
    : context.owner.kind === "user"
      ? `customer:${context.owner.userId}`
      : context.owner.kind === "guest"
        ? `guest:${context.owner.tokenHash}`
        : null;
  if (!scope) throw new ApiError(409, "Reload your cart before ordering");
  const requestHash = orderRequestHash(input);
  const selectedItems = !manual
    ? (input as CheckoutInput).lines
        .filter((line) => line.type === "VARIANT")
        .map((line) => line.id)
    : [];
  const selectedCombos = !manual
    ? (input as CheckoutInput).lines
        .filter((line) => line.type === "COMBO")
        .map((line) => line.id)
    : [];
  return orderTransaction(async (tx) => {
    // Scope lock makes retries agree even when the first request already removed cart lines.
    if (key)
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${scope}:${key}`}, 0))::text`;
    let customerId: string | null = null;
    if (manual) {
      const admin = await tx.user.findFirst({
        where: {
          id: context.adminId,
          role: Role.admin,
          isDeleted: false,
          deletedAt: null,
          emailVerified: true,
        },
        select: { id: true },
      });
      if (!admin) throw new ApiError(403, "Admin account is not active");
    } else if (context.owner.kind === "user") {
      const customer = await lockCustomer(tx, context.owner.userId);
      customerId = customer?.id ?? null;
    }
    if (key) {
      const existing = await tx.order.findUnique({
        where: {
          idempotencyScope_idempotencyKey: {
            idempotencyScope: scope,
            idempotencyKey: key,
          },
        },
        include: orderDetailInclude,
      });
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new ApiError(
            409,
            "Idempotency key was already used with a different request",
          );
        return {
          ...mapOrder(existing, manual),
          ...(existing.guestTokenHash
            ? {
                guestToken: guestOrderToken(
                  existing.id,
                  config.better_auth.secret!,
                ),
              }
            : {}),
        };
      }
    }
    let catalogLines: CatalogLineInput[];
    let cart: { id: string; version: number } | null = null;
    if (manual) {
      const draft = input as ManualOrderInput;
      if (draft.customerId) {
        const customer = await tx.customer.findFirst({
          where: { id: draft.customerId, ...activeCustomerWhere },
          select: { id: true },
        });
        if (!customer) throw new ApiError(404, "Active customer not found");
        customerId = customer.id;
      }
      catalogLines = draft.lines;
    } else {
      const owner = context.owner;
      if (
        owner.kind === "guest" &&
        !(await lockGuest(tx, owner.cartId, owner.tokenHash))
      )
        throw new ApiError(409, "Guest cart expired or changed");
      cart = await tx.cart.findFirst({
        where: ownerWhere(owner),
        select: { id: true, version: true, customerId: true },
      });
      const checkout = input as CheckoutInput;
      if (!cart || cart.version !== checkout.version)
        throw new ApiError(409, "Cart changed. Reload before ordering.");
      const items = selectedItems.length
        ? await tx.cartItem.findMany({
            where: { cartId: cart.id, id: { in: selectedItems } },
            select: { variantId: true, quantity: true },
          })
        : [];
      const combos = selectedCombos.length
        ? await tx.cartCombo.findMany({
            where: { cartId: cart.id, id: { in: selectedCombos } },
            select: {
              comboId: true,
              quantity: true,
              selections: { select: { comboItemId: true, variantId: true } },
            },
          })
        : [];
      if (items.length + combos.length !== checkout.lines.length)
        throw new ApiError(409, "Selected cart lines no longer exist");
      catalogLines = [
        ...items.map((line) => ({ type: "VARIANT" as const, ...line })),
        ...combos.map((line) => ({ type: "COMBO" as const, ...line })),
      ];
    }
    catalogLines = catalogLines.map((line) => catalogLine.parse(line));
    const address = await resolveAddress(tx, input.destination, customerId);
    const now = new Date();
    const { lines, demand, subtotal } = await loadOrderLines(
      tx,
      catalogLines,
      now,
    );
    const draft = manual ? (input as ManualOrderInput) : null;
    const totals = calculateOrderTotals(
      subtotal,
      address.zone,
      config.orders.delivery,
      draft?.discount,
      draft?.deliveryOverride,
    );
    if (
      !input.expected ||
      Object.entries(totals).some(
        ([field, value]) =>
          input.expected![field as keyof typeof totals] !== value,
      )
    )
      throw new ApiError(
        409,
        "Order totals changed. Review the updated items and delivery charges before ordering.",
      );
    const id = randomUUID();
    const token =
      !manual && context.owner.kind === "guest"
        ? guestOrderToken(id, config.better_auth.secret!)
        : null;
    const actor = {
      type: manual ? ("ADMIN" as const) : ("CUSTOMER" as const),
      id: manual
        ? context.adminId
        : context.owner.kind === "user"
          ? context.owner.userId
          : null,
    };
    await changeOrderStock(
      tx,
      [...demand].map(([variantId, quantity]) => ({
        variantId,
        onHand: 0,
        reserved: quantity,
      })),
      id,
      "RESERVE",
      actor,
    );
    const confirmed = draft?.status === "CONFIRMED";
    const order = await tx.order.create({
      data: {
        id,
        number: `MB-${id.replaceAll("-", "").toUpperCase()}`,
        customerId,
        createdById: manual ? context.adminId : null,
        source: draft?.source ?? "WEBSITE",
        status: confirmed ? "CONFIRMED" : "PENDING_CONFIRMATION",
        ...address,
        postalCode: address.postalCode ?? null,
        note: input.note ?? null,
        ...totals,
        expiresAt: confirmed
          ? null
          : new Date(now.getTime() + 24 * 60 * 60_000),
        idempotencyScope: scope,
        idempotencyKey: key,
        requestHash,
        guestTokenHash: token ? hashCartToken(token) : null,
        lines: {
          create: lines.map(({ components, ...line }) => ({
            ...line,
            components: { create: components },
          })),
        },
        history: {
          create: [
            {
              event: "CREATED",
              toStatus: "PENDING_CONFIRMATION",
              actorType: actor.type,
              actorId: actor.id,
              reason: draft?.adjustmentReason ?? null,
              createdAt: now,
            },
            ...(confirmed
              ? [
                  {
                    event: "STATUS_CHANGED",
                    fromStatus: "PENDING_CONFIRMATION" as const,
                    toStatus: "CONFIRMED" as const,
                    actorType: actor.type,
                    actorId: actor.id,
                    createdAt: new Date(now.getTime() + 1),
                  },
                ]
              : []),
          ],
        },
      },
      include: orderDetailInclude,
    });
    if (cart) {
      if (selectedItems.length)
        await tx.cartItem.deleteMany({
          where: { cartId: cart.id, id: { in: selectedItems } },
        });
      if (selectedCombos.length)
        await tx.cartCombo.deleteMany({
          where: { cartId: cart.id, id: { in: selectedCombos } },
        });
      await tx.cart.update({
        where: { id: cart.id },
        data: { version: { increment: 1 } },
        select: { id: true },
      });
    }
    if (customerId)
      await tx.$executeRaw`
      UPDATE customers SET "ordersCount" = "ordersCount" + 1,
        "firstOrderAt" = COALESCE("firstOrderAt", ${now}), "lastOrderAt" = ${now}, "updatedAt" = ${now}
      WHERE id = ${customerId}
    `;
    return {
      ...mapOrder(order, manual),
      ...(token ? { guestToken: token } : {}),
    };
  });
};
