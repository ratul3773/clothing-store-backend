import type { ComboWithItems } from "../combo/combo.select";
import { mapCombo } from "../combo/combo.mapper";

// A separate detail key avoids collisions with independently generated combo slugs.
export const comboProductSlug = (id: string) => `combo--${id}`;

export const mapComboProduct = (combo: ComboWithItems) => {
  const dto = mapCombo(combo);
  const urls = [...new Set(dto.items.flatMap((item) => item.product.imageUrl ? [item.product.imageUrl] : []))];
  return {
    type: "COMBO" as const,
    id: combo.id,
    comboId: combo.id,
    name: combo.name,
    slug: combo.slug,
    description: combo.description,
    code: null, material: null, fit: null, careInstructions: null,
    category: null,
    regularPrice: combo.price,
    effectivePrice: combo.price,
    combinedPrice: dto.combinedPrice,
    savings: dto.savings,
    hasOffer: false,
    discountPercentage: dto.discountPercentage,
    offer: null,
    badges: ["COMBO"] as const,
    // Combo exchange eligibility has no policy yet.
    isExchangeEligible: null,
    seoTitle: null, seoDescription: null,
    publishedAt: (combo.startsAt ?? combo.createdAt).toISOString(),
    images: urls.map((url, index) => ({
      id: `${combo.id}-${index}`, url, alt: combo.name, colorId: null,
      sortOrder: index, isPrimary: index === 0, createdAt: combo.createdAt.toISOString(),
    })),
    colors: [], variants: [],
    inStock: dto.inStock,
    lowStock: dto.lowStock,
    maxQuantity: dto.maxQuantity,
    items: dto.items,
    currency: dto.currency,
    moneyUnit: dto.moneyUnit,
  };
};
