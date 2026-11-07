import { z } from "zod";
import { normalizeBdPhone } from "../../../utils/phone";
import { OrderSource, OrderStatus } from "../../../generated/prisma/enums";
import { CART_LINE_LIMIT, CART_QUANTITY_STORAGE_MAX } from "../cart/cart.constants";

export const money = z.number().int().min(0).max(2_147_483_647);
const quantity = z.number().int().min(1).max(CART_QUANTITY_STORAGE_MAX);
const version = z.number().int().min(0).max(2_147_483_647);
const id = z.string().uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
export const shippingAddress = z.object({
  recipientName: text(100),
  recipientPhone: z.string().transform(normalizeBdPhone).pipe(z.string()),
  district: text(100),
  area: text(100),
  addressLine: text(500),
  postalCode: text(20).nullable().optional(),
  zone: z.enum(["INSIDE_DHAKA", "OUTSIDE_DHAKA"]),
}).strict();
const destination = z.union([
  z.object({ addressId: id }).strict(),
  z.object({ address: shippingAddress }).strict(),
]);
const expected = z.object({ subtotal: money, discount: money, deliveryFee: money, total: money }).strict();
export const catalogLine = z.discriminatedUnion("type", [
  z.object({ type: z.literal("VARIANT"), variantId: id, quantity }).strict(),
  z.object({ type: z.literal("COMBO"), comboId: id, quantity,
    selections: z.array(z.object({ comboItemId: id, variantId: id }).strict()).min(1).max(3)
      .refine((items) => new Set(items.map((item) => item.comboItemId)).size === items.length,
        "Choose one size per combo component"),
  }).strict(),
]);
const checkout = z.object({
  lines: z.array(z.object({ id, type: z.enum(["VARIANT", "COMBO"]) }).strict()).min(1).max(CART_LINE_LIMIT)
    .refine((lines) => new Set(lines.map((line) => `${line.type}:${line.id}`)).size === lines.length,
      "Duplicate cart lines are not allowed"),
  version,
  destination,
  note: text(1000).optional(),
  expected: expected.optional(),
}).strict();
const manual = z.object({
  lines: z.array(catalogLine).min(1).max(CART_LINE_LIMIT),
  destination,
  customerId: id.optional(),
  source: z.enum(["ADMIN_MANUAL", "WHATSAPP", "FACEBOOK", "INSTAGRAM", "PHONE"]).default("ADMIN_MANUAL"),
  status: z.enum(["PENDING_CONFIRMATION", "CONFIRMED"]).default("CONFIRMED"),
  discount: money.default(0),
  deliveryOverride: money.optional(),
  adjustmentReason: text(500).optional(),
  note: text(1000).optional(),
  expected: expected.optional(),
}).strict().refine((input) => !(input.discount || input.deliveryOverride !== undefined) || !!input.adjustmentReason,
  "A reason is required for manual pricing adjustments");
const params = z.object({ id });
const queryInt = (max: number) => z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(max));
const listQuery = z.object({
  page: queryInt(2_147_483_647).optional(),
  limit: queryInt(100).optional(),
  status: z.enum(OrderStatus).optional(),
  source: z.enum(OrderSource).optional(),
  q: text(100).optional(),
  from: z.iso.datetime().transform((value) => new Date(value)).optional(),
  to: z.iso.datetime().transform((value) => new Date(value)).optional(),
}).strict().refine((q) => !q.from || !q.to || q.from <= q.to, "Invalid date range");

export const OrderValidation = {
  preview: z.object({ body: checkout }),
  create: z.object({ body: checkout.refine((input) => !!input.expected, "Expected totals are required") }),
  manualPreview: z.object({ body: manual }),
  manualCreate: z.object({ body: manual.refine((input) => !!input.expected, "Expected totals are required") }),
  detail: z.object({ params }),
  list: z.object({ query: listQuery }),
  cancel: z.object({ params, body: z.object({ version, reason: text(500).optional() }).strict() }),
  transition: z.object({ params, body: z.object({ version,
    status: z.enum(["CONFIRMED", "CANCELLED", "SHIPPED", "DELIVERED", "DELIVERY_FAILED"]),
    reason: text(500).optional(),
  }).strict().refine((input) => !["CANCELLED", "DELIVERY_FAILED"].includes(input.status) || !!input.reason,
    "A reason is required for cancellation or failed delivery") }),
  returnReceipt: z.object({ params, body: z.object({ version, reason: text(500),
    components: z.array(z.object({ id, sellable: money, damaged: money }).strict()).min(1).max(CART_LINE_LIMIT * 3)
      .refine((items) => new Set(items.map((item) => item.id)).size === items.length, "Duplicate components"),
  }).strict() }),
};

export type CheckoutInput = z.infer<typeof checkout>;
export type ManualOrderInput = z.infer<typeof manual>;
export type CatalogLineInput = z.infer<typeof catalogLine>;
export type OrderListQuery = z.infer<typeof listQuery>;
export type ShippingAddress = z.infer<typeof shippingAddress>;
export type TransitionInput = z.infer<typeof OrderValidation.transition>["body"];
export type ReturnReceiptInput = z.infer<typeof OrderValidation.returnReceipt>["body"];
