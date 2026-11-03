import { resolveActiveOffer } from "../product/catalog.rules";
import { publicUrlFor } from "../upload/storage";
import { CartDto, CartItemDto, CartItemStatus } from "./cart.interface";
import { CartAvailabilityVariant, CartWithItems, CartSummaryLine } from "./cart.select";
import { isVariantPublic } from "../product/catalog.rules";
import { safeInteger as safeAmount } from "../combo/combo.rules";
import { CART_LINE_LIMIT } from "./cart.constants";

export const mapCartSummary = (
  lines: CartSummaryLine[],
  publicCategoryIds: ReadonlySet<string>,
  now: Date,
) => {
  const selectionItems = lines.map((line) => {
    const status = getCartItemStatus(line.variant, line.quantity, publicCategoryIds, now);
    const product = line.variant.product;
    const unitPrice = resolveActiveOffer(product.offers, product.regularPrice, now)?.offerPrice ?? product.regularPrice;
    return {
      id: line.id,
      status,
      lineSubtotal: status === "UNAVAILABLE" ? null : safeAmount(unitPrice * line.quantity),
    };
  });
  return {
    selectionItems,
    distinctItemCount: lines.length,
    totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
    validItemsSubtotal: safeAmount(selectionItems.reduce((sum, item) => sum + (item.status === "AVAILABLE" ? item.lineSubtotal ?? 0 : 0), 0)),
    allItemsAvailable: lines.length > 0 && selectionItems.every((item) => item.status === "AVAILABLE"),
  };
};

export const getCartItemStatus = (
  variant: CartAvailabilityVariant,
  quantity: number,
  publicCategoryIds: ReadonlySet<string>,
  now: Date,
): CartItemStatus => {
  if (!isVariantPublic(variant, publicCategoryIds, now))
    return "UNAVAILABLE";
  const available = variant.onHand - variant.reserved;
  if (available <= 0) return "OUT_OF_STOCK";
  return quantity > available ? "INSUFFICIENT_STOCK" : "AVAILABLE";
};

export const mapCart = (
  cart: CartWithItems | null,
  publicCategoryIds: ReadonlySet<string>,
  now: Date,
): CartDto => {
  const items: CartItemDto[] = (cart?.items ?? []).map((item) => {
    const { variant } = item;
    const { product } = variant;
    const status = getCartItemStatus(
      variant,
      item.quantity,
      publicCategoryIds,
      now,
    );
    const base = {
      type: "VARIANT" as const,
      id: item.id,
      variantId: item.variantId,
      quantity: item.quantity,
      status,
    };
    // Keep the removable line, but never leak hidden catalogue data or prices.
    if (status === "UNAVAILABLE")
      return {
        ...base,
        maxQuantity: 0,
        product: null,
        variant: null,
        regularPrice: null,
        unitPrice: null,
        lineSubtotal: null,
      };
    const offer = resolveActiveOffer(product.offers, product.regularPrice, now);
    const unitPrice = offer?.offerPrice ?? product.regularPrice;
    const image =
      product.images.find((image) => image.colorId === variant.colorId) ??
      product.images[0];
    return {
      ...base,
      maxQuantity: Math.max(0, variant.onHand - variant.reserved),
      product: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        imageUrl: image ? publicUrlFor(image.provider, image.storageKey) : null,
      },
      variant: { color: variant.color.name, size: variant.size },
      regularPrice: product.regularPrice,
      unitPrice,
      lineSubtotal: safeAmount(unitPrice * item.quantity),
    };
  });
  return {
    id: cart?.id ?? null,
    version: cart?.version ?? 0,
    currency: "BDT",
    moneyUnit: "taka",
    limits: {
      distinctItems: CART_LINE_LIMIT,
      quantityPerVariant: null,
    },
    items,
    distinctItemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    validItemsSubtotal: safeAmount(
      items.reduce(
        (sum, item) =>
          sum + (item.status === "AVAILABLE" ? (item.lineSubtotal ?? 0) : 0),
        0,
      ),
    ),
    allItemsAvailable:
      items.length > 0 && items.every((item) => item.status === "AVAILABLE"),
  };
};
