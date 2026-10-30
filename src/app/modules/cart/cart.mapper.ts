import { ProductStatus } from "../../../generated/prisma/enums";
import { resolveActiveOffer } from "../product/catalog.rules";
import { publicUrlFor } from "../upload/storage";
import { CART_MAX_ITEMS, CART_MAX_QUANTITY } from "./cart.constants";
import { CartDto, CartItemDto, CartItemStatus } from "./cart.interface";
import { CartLine, CartWithItems } from "./cart.select";

export const getCartItemStatus = (
  variant: CartLine["variant"],
  quantity: number,
  publicCategoryIds: ReadonlySet<string>,
  now: Date,
): CartItemStatus => {
  const product = variant.product;
  if (
    !variant.isActive ||
    product.status !== ProductStatus.ACTIVE ||
    !product.publishedAt ||
    product.publishedAt > now ||
    !publicCategoryIds.has(product.categoryId)
  )
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
      maxQuantity: Math.min(
        CART_MAX_QUANTITY,
        Math.max(0, variant.onHand - variant.reserved),
      ),
      product: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        imageUrl: image ? publicUrlFor(image.provider, image.storageKey) : null,
      },
      variant: { color: variant.color.name, size: variant.size },
      regularPrice: product.regularPrice,
      unitPrice,
      lineSubtotal: unitPrice * item.quantity,
    };
  });
  return {
    id: cart?.id ?? null,
    version: cart?.version ?? 0,
    currency: "BDT",
    moneyUnit: "taka",
    limits: {
      distinctItems: CART_MAX_ITEMS,
      quantityPerVariant: CART_MAX_QUANTITY,
    },
    items,
    distinctItemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    validItemsSubtotal: items.reduce(
      (sum, item) =>
        sum + (item.status === "AVAILABLE" ? (item.lineSubtotal ?? 0) : 0),
      0,
    ),
    allItemsAvailable:
      items.length > 0 && items.every((item) => item.status === "AVAILABLE"),
  };
};
