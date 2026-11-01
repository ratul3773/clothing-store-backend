import { z } from "zod";
import { CART_QUANTITY_STORAGE_MAX } from "./cart.constants";

const version = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const quantity = z.number().int().min(1).max(CART_QUANTITY_STORAGE_MAX);
const itemParams = z.object({ itemId: z.string().uuid() }).strict();

export const CartValidation = {
  getCart: z.object({ query: z.object({}).strict().default({}) }),
  addItem: z.object({
    body: z
      .object({ variantId: z.string().uuid(), quantity, version })
      .strict(),
    query: z.object({}).strict().default({}),
  }),
  updateItem: z.object({
    params: itemParams,
    body: z.object({ quantity, version }).strict(),
    query: z.object({}).strict().default({}),
  }),
  removeItem: z.object({
    params: itemParams,
    query: z
      .object({
        version: z.string().regex(/^\d+$/).transform(Number).pipe(version),
      })
      .strict(),
    body: z.object({}).strict().optional(),
  }),
  clearCart: z.object({
    query: z
      .object({
        version: z.string().regex(/^\d+$/).transform(Number).pipe(version),
      })
      .strict(),
    body: z.object({}).strict().optional(),
  }),
};
