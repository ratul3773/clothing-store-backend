import { Prisma } from "../../../generated/prisma/client";

type CatalogVariant = {
  isActive: boolean;
  product: { status: string; publishedAt: Date | null; categoryId: string };
};

export const isVariantPublic = (variant: CatalogVariant, publicIds: ReadonlySet<string>, now: Date) =>
  variant.isActive && variant.product.status === "ACTIVE" &&
  variant.product.publishedAt !== null && variant.product.publishedAt <= now &&
  publicIds.has(variant.product.categoryId);

export type CategoryNode = {
  id: string;
  parentId: string | null;
  isActive: boolean;
};

export const isPublicCategory = (
  category: CategoryNode,
  categories: ReadonlyMap<string, CategoryNode>,
): boolean => {
  if (!category.isActive) return false;
  const visited = new Set([category.id]);
  let parentId = category.parentId;
  while (parentId) {
    if (visited.has(parentId)) return false;
    visited.add(parentId);
    const parent = categories.get(parentId);
    if (!parent || !parent.isActive) return false;
    parentId = parent.parentId;
  }
  return true;
};

export const getPublicCategoryIds = async (
  db: Pick<Prisma.TransactionClient, "category">,
): Promise<Set<string>> => {
  const categories = await db.category.findMany({
    select: { id: true, parentId: true, isActive: true },
  });
  const byId = new Map(categories.map((category) => [category.id, category]));
  return new Set(
    categories
      .filter((category) => isPublicCategory(category, byId))
      .map((category) => category.id),
  );
};

type PricedOffer = {
  isActive: boolean;
  startsAt: Date;
  endsAt: Date | null;
  offerPrice: number;
};

// Prices belong to the product and are shared by every colour/size variant.
export const resolveActiveOffer = <T extends PricedOffer>(
  offers: readonly T[],
  regularPrice: number,
  now: Date,
): T | null =>
  offers
    .filter(
      (offer) =>
        offer.isActive &&
        offer.startsAt <= now &&
        (!offer.endsAt || offer.endsAt > now) &&
        offer.offerPrice < regularPrice,
    )
    .sort((a, b) => a.offerPrice - b.offerPrice)[0] ?? null;
