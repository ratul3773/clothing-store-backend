import { z } from "zod";
import { CartValidation } from "./cart.validation";

export type CartOwner =
  | { kind: "user"; userId: string }
  | { kind: "guest"; cartId: string; tokenHash: string }
  | { kind: "newGuest"; tokenHash: string }
  | { kind: "none" };

export type CartMergeAdjustment = {
  variantId: string;
  requestedQuantity: number;
  retainedQuantity: number;
  reason: "STOCK_CAP" | "UNAVAILABLE";
};
export type CartMergeReport = {
  merged: boolean;
  adjustments: CartMergeAdjustment[];
};

export type AddCartItemInput = z.infer<typeof CartValidation.addItem>["body"];
export type UpdateCartItemInput = z.infer<
  typeof CartValidation.updateItem
>["body"];
export type CartVersionQuery = z.infer<
  typeof CartValidation.clearCart
>["query"];
export type CartItemStatus =
  | "AVAILABLE"
  | "INSUFFICIENT_STOCK"
  | "OUT_OF_STOCK"
  | "UNAVAILABLE";

export type CartItemDto = {
  id: string;
  variantId: string;
  quantity: number;
  status: CartItemStatus;
  maxQuantity: number;
  product: {
    id: string;
    name: string;
    slug: string;
    imageUrl: string | null;
  } | null;
  variant: { color: string; size: string } | null;
  regularPrice: number | null;
  unitPrice: number | null;
  lineSubtotal: number | null;
};

export type CartDto = {
  id: string | null;
  version: number;
  currency: "BDT";
  moneyUnit: "taka";
  limits: { distinctItems: null; quantityPerVariant: null };
  items: CartItemDto[];
  distinctItemCount: number;
  totalQuantity: number;
  validItemsSubtotal: number;
  allItemsAvailable: boolean;
};
