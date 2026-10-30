import { StorageProvider } from "../../../generated/prisma/enums";
import { publicUrlFor } from "../upload/storage";
import { CategoryDto, CategoryLike } from "./category.interface";

export const mapCategory = (category: CategoryLike): CategoryDto => ({
  id: category.id,
  parentId: category.parentId,
  name: category.name,
  slug: category.slug,
  description: category.description,
  imageUrl:
    category.imageKey && category.imageProvider
      ? publicUrlFor(
          category.imageProvider as StorageProvider,
          category.imageKey,
        )
      : null,
  sortOrder: category.sortOrder,
  isActive: category.isActive,
  seoTitle: category.seoTitle,
  seoDescription: category.seoDescription,
  productCount: category._count?.products ?? 0,
  childCount: category._count?.children ?? 0,
  createdAt: category.createdAt.toISOString(),
  updatedAt: category.updatedAt.toISOString(),
});

export const mapCategoryTree = (
  roots: CategoryLike[],
  byParent: Map<string, CategoryLike[]>,
  includeInactive = false,
): CategoryDto[] =>
  roots.map((root) => {
    const childRecords = (byParent.get(root.id) ?? []).filter(
      (child) => includeInactive || child.isActive,
    );

    return {
      ...mapCategory(root),
      children: mapCategoryTree(childRecords, byParent, includeInactive),
    };
  });
