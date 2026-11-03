import { z } from "zod";
import { CART_QUANTITY_STORAGE_MAX } from "./cart.constants";

const version = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const quantity = z.number().int().min(1).max(CART_QUANTITY_STORAGE_MAX);
const itemParams = z.object({ itemId: z.string().uuid() }).strict();
const positiveQueryInteger = (max: number) =>
  z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().min(1).max(max));

export const CartValidation = {
  addCombo: z.object({
    body: z.object({ comboId: z.string().uuid(), quantity, version,
      selections: z.array(z.object({ comboItemId: z.string().uuid(), variantId: z.string().uuid() }).strict()).min(1).max(3)
        .refine((items) => new Set(items.map((item) => item.comboItemId)).size === items.length, { message: "Choose one size for each combo component" }),
    }).strict(),
    query: z.object({}).strict().default({}),
  }),
  getCart: z.object({ query: z.object({
    page: positiveQueryInteger(2_147_483_647).optional(),
    limit: positiveQueryInteger(100).optional(),
  }).strict().default({}) }),
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
