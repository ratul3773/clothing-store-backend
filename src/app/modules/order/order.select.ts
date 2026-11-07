import { Prisma } from "../../../generated/prisma/client";

export const orderSummarySelect = {
  id: true,
  number: true,
  customerId: true,
  source: true,
  status: true,
  version: true,
  recipientName: true,
  recipientPhone: true,
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

export type OrderDetail = Prisma.OrderGetPayload<{
  include: typeof orderDetailInclude;
}>;

export const mapOrder = (order: OrderDetail, admin = false) => {
  const {
    idempotencyScope,
    idempotencyKey,
    requestHash,
    guestTokenHash,
    createdById,
    history,
    ...receipt
  } = order;
  return {
    ...receipt,
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
        reason,
      }) => ({
        id,
        event,
        fromStatus,
        toStatus,
        createdAt,
        ...(admin ? { actorType, actorId, reason } : {}),
      }),
    ),
  };
};
