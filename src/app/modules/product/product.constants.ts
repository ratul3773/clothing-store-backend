export const PRODUCT_FITS = [
  "slim",
  "regular",
  "relaxed",
  "oversized",
] as const;

export const PUBLIC_PRODUCT_SORTS = [
  "newest",
  "name_asc",
  "name_desc",
  "price_asc",
  "price_desc",
] as const;

export const ADMIN_PRODUCT_SORTS = [
  ...PUBLIC_PRODUCT_SORTS,
  "updated_desc",
] as const;

export const ADMIN_STOCK_ADJUSTMENT_TYPES = [
  "RESTOCK",
  "ADJUSTMENT",
  "DAMAGED",
  "STOCKTAKE",
] as const;

export type AdminStockAdjustmentType =
  (typeof ADMIN_STOCK_ADJUSTMENT_TYPES)[number];
