import { resolveActiveOffer } from "../product/catalog.rules";
import { safeInteger } from "./combo.rules";

type PricedItem = {
  quantity: number;
  color: { product: { regularPrice: number; offers: Parameters<typeof resolveActiveOffer>[0] } };
};

export const componentUnitPrice = (product: PricedItem["color"]["product"], now: Date) =>
  resolveActiveOffer(product.offers, product.regularPrice, now)?.offerPrice ?? product.regularPrice;

export const comboPricing = (items: readonly PricedItem[], price: number, now: Date) => {
  const combinedPrice = safeInteger(items.reduce((sum, item) =>
    sum + componentUnitPrice(item.color.product, now) * item.quantity, 0));
  const savings = Math.max(0, combinedPrice - price);
  return {
    combinedPrice,
    savings,
    discountPercentage: combinedPrice > 0 ? Math.round(savings / combinedPrice * 10_000) / 100 : 0,
  };
};
