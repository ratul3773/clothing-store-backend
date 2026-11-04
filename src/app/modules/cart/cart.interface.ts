import { z } from "zod";
import { CartValidation } from "./cart.validation";

export type CartOwner =
  | { kind: "user"; userId: string }
  | { kind: "guest"; cartId: string; tokenHash: string }
  | { kind: "newGuest"; tokenHash: string }
  | { kind: "none" };

export type CartMergeAdjustment = (
  | { type: "VARIANT"; variantId: string }
  | { type: "COMBO"; comboId: string }
) & {
  requestedQuantity: number;
  retainedQuantity: number;
  reason: "STOCK_CAP" | "UNAVAILABLE" | "LINE_LIMIT";
};
export type CartMergeReport = {
  merged: boolean;
  adjustments: CartMergeAdjustment[];
};

export type AddCartItemInput = z.infer<typeof CartValidation.addItem>["body"];
export type AddCartComboInput = z.infer<typeof CartValidation.addCombo>["body"];
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
  | "SELECTION_REQUIRED"
  | "UNAVAILABLE";

export type CartItemDto = {
  type: "VARIANT";
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

export type CartComboDto = {
  type: "COMBO";
  id: string;
  comboId: string | null;
  variantId: null;
  quantity: number;
  status: CartItemStatus;
  maxQuantity: number;
  combo: ReturnType<typeof import("../combo/combo.mapper").mapCombo> | null;
  requiresSelection: boolean;
  selectionIssue: "INCOMPLETE" | "INVALID" | null;
  selections: Array<{ comboItemId: string; variantId: string; size: string }>;
  product: null;
  variant: null;
  regularPrice: null;
  unitPrice: number | null;
  lineSubtotal: number | null;
};

export type CartDto = {
  id: string | null;
  version: number;
  currency: "BDT";
  moneyUnit: "taka";
  limits: { distinctItems: number | null; quantityPerVariant: number | null };
  items: (CartItemDto | CartComboDto)[];
  distinctItemCount: number;
  totalQuantity: number;
  validItemsSubtotal: number;
  allItemsAvailable: boolean;
  selectionItems?: Array<{ id: string; type: "VARIANT" | "COMBO"; status: CartItemStatus; lineSubtotal: number | null }>;
};
