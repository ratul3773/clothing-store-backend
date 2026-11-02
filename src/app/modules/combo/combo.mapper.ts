import { publicUrlFor } from "../upload/storage";
import { comboCapacity } from "./combo.rules";
import type { ComboWithItems } from "./combo.select";

export const mapCombo = (combo: ComboWithItems) => {
  const items = combo.items.map(({ variantId, quantity, variant }) => {
    const image = variant.product.images.find((image) => image.colorId === variant.colorId) ?? variant.product.images[0];
    return {
      variantId, quantity,
      product: { id: variant.product.id, name: variant.product.name, slug: variant.product.slug,
        imageUrl: image ? publicUrlFor(image.provider, image.storageKey) : null },
      variant: { color: variant.color.name, size: variant.size },
    };
  });
  const maxQuantity = comboCapacity(combo);
  return {
    id: combo.id, name: combo.name, slug: combo.slug, description: combo.description,
    price: combo.price, currency: "BDT" as const, moneyUnit: "taka" as const,
    imageUrl: items.find((item) => item.product.imageUrl)?.product.imageUrl ?? null,
    startsAt: combo.startsAt, endsAt: combo.endsAt, isActive: combo.isActive,
    items, maxQuantity, inStock: maxQuantity > 0,
  };
};
