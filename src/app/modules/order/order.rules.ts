import { createHash, createHmac } from "node:crypto";
import ApiError from "../../../errors/ApiError";
import type { OrderStatus } from "../../../generated/prisma/enums";

export const orderMoney = (value: number) => {
  if (!Number.isInteger(value) || value < 0 || value > 2_147_483_647)
    throw new ApiError(422, "Order amount exceeds the supported range");
  return value;
};

export const calculateOrderTotals = (
  subtotal: number,
  zone: string,
  policy: { inside: number; outside: number; freeAbove: number },
  discount = 0,
  deliveryOverride?: number,
) => {
  orderMoney(subtotal);
  orderMoney(discount);
  if (discount > subtotal) throw new ApiError(422, "Discount cannot exceed subtotal");
  const deliveryFee = orderMoney(deliveryOverride ?? (subtotal >= policy.freeAbove ? 0 :
    zone === "INSIDE_DHAKA" ? policy.inside : policy.outside));
  return { subtotal, discount, deliveryFee, total: orderMoney(subtotal - discount + deliveryFee) };
};

const transitions: Partial<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING_CONFIRMATION: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SHIPPED"],
  SHIPPED: ["DELIVERED", "DELIVERY_FAILED"],
  DELIVERY_FAILED: ["RETURNED"],
};
export const assertOrderTransition = (from: OrderStatus, to: OrderStatus) => {
  if (!transitions[from]?.includes(to)) throw new ApiError(409, `Cannot change order from ${from} to ${to}`);
};

// Sort object keys so equivalent validated requests have the same fingerprint.
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, canonical(entry)]));
  return value;
};
export const orderRequestHash = (input: unknown) => createHash("sha256").update(JSON.stringify(canonical(input))).digest("hex");
export const guestOrderToken = (id: string, secret: string) =>
  createHmac("sha256", secret).update(`order-tracking:${id}`).digest("base64url");
