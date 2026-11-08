import { z } from "zod";
import ApiError from "../../../errors/ApiError";
import type {
  AddressSnapshot,
  OrderComponentSnapshot,
  ProductSnapshot,
} from "./order.interface";
import { money, shippingAddress } from "./order.validation";

export const addressSnapshotSchema = shippingAddress.extend({
  postalCode: shippingAddress.shape.postalCode.unwrap(),
}) satisfies z.ZodType<AddressSnapshot>;

export const productSnapshotSchema = z
  .object({
    name: z.string().min(1),
    unitPrice: money,
    imageUrl: z.string().min(1).nullable(),
  })
  .strict() satisfies z.ZodType<ProductSnapshot>;

export const componentSnapshotSchema = z
  .object({
    productName: z.string().min(1),
    sku: z.string().min(1),
    color: z.string().min(1),
    size: z.string().min(1),
    imageUrl: productSnapshotSchema.shape.imageUrl,
  })
  .strict() satisfies z.ZodType<OrderComponentSnapshot>;

export function readOrderSnapshot<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(500, "Order snapshot is invalid");
  return result.data;
}
