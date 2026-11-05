import { publicUrlFor } from "../upload/storage";
import { comboCapacity, isComboVariantAllowed } from "./combo.rules";
import type { ComboWithItems } from "./combo.select";
import { comboPricing, componentUnitPrice } from "./combo.pricing";

export const mapCombo = (combo: ComboWithItems, now: Date, publicIds: ReadonlySet<string>, admin = false) => {
  const items = combo.items.map(({ id, colorId, quantity, color, variantIds }) => {
    const image = color.product.images.find((image) => image.colorId === colorId) ?? color.product.images[0];
    return {
      id, colorId, quantity, variantIds: variantIds?.length ? variantIds : null,
      product: { id: color.product.id, name: color.product.name, slug: color.product.slug,
        unitPrice: componentUnitPrice(color.product, now), imageUrl: image ? publicUrlFor(image.provider, image.storageKey) : null },
      color: { id: color.id, name: color.name, hex: color.hex },
      variants: color.variants.filter((variant) => (admin || (variant.isActive && isComboVariantAllowed({ variantIds }, variant.id))) && variant.productId === color.product.id).map((variant) => ({
        id: variant.id, size: variant.size, available: Math.max(0, variant.onHand - variant.reserved),
        maxQuantity: Math.max(0, Math.floor((variant.onHand - variant.reserved) / quantity)),
      })),
    };
  });
  const maxQuantity = comboCapacity(combo, publicIds, now);
  return {
    id: combo.id, name: combo.name, slug: combo.slug, description: combo.description,
    price: combo.price, currency: "BDT" as const, moneyUnit: "taka" as const,
    ...comboPricing(combo.items, combo.price, now),
    imageUrl: items.find((item) => item.product.imageUrl)?.product.imageUrl ?? null,
    startsAt: combo.startsAt, endsAt: combo.endsAt, isActive: combo.isActive,
    items, maxQuantity, inStock: maxQuantity > 0,
    lowStock: maxQuantity > 0 && combo.items.some((item) => item.color.variants.filter((v) => v.isActive && isComboVariantAllowed(item, v.id)).every((v) => v.onHand - v.reserved <= v.lowStockThreshold)),
  };
};
