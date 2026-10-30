import httpStatus from "http-status";
import { Prisma } from "../../../generated/prisma/client";
import { StorageProvider } from "../../../generated/prisma/enums";
import ApiError from "../../../errors/ApiError";
import { prisma } from "../../../lib/prisma";
import { buildStorageKey } from "../upload/local.storage";
import { activeImageStorage, storageForProvider } from "../upload/storage";
import { mapCategory, mapCategoryTree } from "./category.mapper";
import { CategoryLike } from "./category.interface";
import { CreateCategoryInput, UpdateCategoryInput } from "./category.interface";
import { buildUniqueSlug } from "../../../utils/slug";

const categorySelect = {
  id: true,
  parentId: true,
  name: true,
  slug: true,
  description: true,
  imageKey: true,
  imageProvider: true,
  sortOrder: true,
  isActive: true,
  seoTitle: true,
  seoDescription: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      children: true,
      products: true,
    },
  },
} as const;

const getCategoryOrThrow = async (id: string) => {
  const category = await prisma.category.findUnique({
    where: { id },
    select: categorySelect,
  });

  if (!category) {
    throw new ApiError(httpStatus.NOT_FOUND, "Category not found");
  }

  return category;
};

const assertParentIsValid = async (
  parentId: string | null | undefined,
  currentId?: string,
) => {
  if (parentId === undefined || parentId === null) return;

  if (currentId && parentId === currentId) {
    throw new ApiError(
      httpStatus.UNPROCESSABLE_ENTITY,
      "A category cannot be its own parent",
    );
  }

  const parent = await prisma.category.findUnique({
    where: { id: parentId },
    select: { id: true, parentId: true },
  });

  if (!parent) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Parent category not found");
  }

  if (!currentId) return;

  let cursor: string | null = parent.parentId;
  const visited = new Set<string>([parent.id]);

  while (cursor) {
    if (cursor === currentId) {
      throw new ApiError(
        httpStatus.UNPROCESSABLE_ENTITY,
        "Moving this category would create a cycle",
      );
    }

    if (visited.has(cursor) || visited.size > 50) {
      throw new ApiError(
        httpStatus.UNPROCESSABLE_ENTITY,
        "Category hierarchy is invalid",
      );
    }

    visited.add(cursor);

    const next: { parentId: string | null } | null =
      await prisma.category.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });

    cursor = next?.parentId ?? null;
  }
};

const resolveSlug = async (name: string, excludeId?: string) => {
  return buildUniqueSlug(name, async (slug) => {
    const existing = await prisma.category.findUnique({
      where: { slug },
      select: { id: true },
    });
    return Boolean(existing && existing.id !== excludeId);
  });
};

const listPublicCategories = async () => {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    select: categorySelect,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const byParent = new Map<string, CategoryLike[]>();

  for (const category of categories) {
    if (!category.parentId) continue;
    const list = byParent.get(category.parentId) ?? [];
    list.push(category);
    byParent.set(category.parentId, list);
  }

  const roots = categories.filter(
    (category) => category.parentId === null,
  );

  return mapCategoryTree(roots, byParent);
};

const getPublicCategory = async (slug: string) => {
  const category = await prisma.category.findUnique({
    where: { slug },
    select: categorySelect,
  });

  if (!category || !category.isActive) {
    throw new ApiError(httpStatus.NOT_FOUND, "Category not found");
  }

  let parentId = category.parentId;
  const visited = new Set<string>();

  while (parentId) {
    if (visited.has(parentId)) {
      throw new ApiError(httpStatus.NOT_FOUND, "Category not found");
    }
    visited.add(parentId);

    const parent: { id: string; parentId: string | null; isActive: boolean } | null =
      await prisma.category.findUnique({
        where: { id: parentId },
        select: { id: true, parentId: true, isActive: true },
      });

    if (!parent || !parent.isActive) {
      throw new ApiError(httpStatus.NOT_FOUND, "Category not found");
    }

    parentId = parent.parentId;
  }

  const children = await prisma.category.findMany({
    where: { parentId: category.id, isActive: true },
    select: categorySelect,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return {
    ...mapCategory(category),
    children: children.map(mapCategory),
  };
};

const listAdminCategories = async () => {
  const categories = await prisma.category.findMany({
    select: categorySelect,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return categories.map(mapCategory);
};

const createCategory = async (input: CreateCategoryInput) => {
  await assertParentIsValid(input.parentId);

  const slug = await resolveSlug(input.name);
  const category = await prisma.category.create({
    data: {
      name: input.name,
      slug,
      parentId: input.parentId ?? null,
      description: input.description ?? null,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
    },
    select: categorySelect,
  });

  return mapCategory(category);
};

const updateCategory = async (
  id: string,
  input: UpdateCategoryInput,
) => {
  const current = await getCategoryOrThrow(id);

  if (input.parentId !== undefined) {
    await assertParentIsValid(input.parentId, id);
  }

  if (input.isActive === false) {
    const activeProducts = await prisma.product.count({
      where: { categoryId: id, status: "ACTIVE" },
    });

    if (activeProducts > 0) {
      throw new ApiError(
        httpStatus.CONFLICT,
        "Deactivate or move active products before archiving this category",
      );
    }
  }

  const data: Prisma.CategoryUncheckedUpdateInput = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.seoTitle !== undefined) data.seoTitle = input.seoTitle;
  if (input.seoDescription !== undefined) {
    data.seoDescription = input.seoDescription;
  }

  if (input.parentId !== undefined) {
    data.parentId = input.parentId;
  }

  if (input.name !== undefined && input.name !== current.name) {
    data.slug = await resolveSlug(input.name, id);
  }

  const category = await prisma.category.update({
    where: { id },
    data,
    select: categorySelect,
  });

  return mapCategory(category);
};

const deleteCategory = async (id: string) => {
  await getCategoryOrThrow(id);

  const [children, products, activeProducts] = await Promise.all([
    prisma.category.count({ where: { parentId: id } }),
    prisma.product.count({ where: { categoryId: id } }),
    prisma.product.count({
      where: { categoryId: id, status: "ACTIVE" },
    }),
  ]);

  if (children > 0) {
    throw new ApiError(
      httpStatus.CONFLICT,
      "Move or delete child categories first",
    );
  }

  if (activeProducts > 0) {
    throw new ApiError(
      httpStatus.CONFLICT,
      "Deactivate or move active products before deleting this category",
    );
  }

  if (products > 0) {
    const category = await prisma.category.update({
      where: { id },
      data: { isActive: false },
      select: categorySelect,
    });

    return { deleted: false, archived: true, category: mapCategory(category) };
  }

  const category = await getCategoryOrThrow(id);
  const imageToDelete = category.imageKey
    ? {
        key: category.imageKey,
        provider: category.imageProvider as StorageProvider,
      }
    : null;

  await prisma.category.delete({ where: { id } });

  if (imageToDelete) {
    try {
      await storageForProvider(imageToDelete.provider).delete(
        imageToDelete.key,
      );
    } catch (error) {
      console.error("[STORAGE] Failed to delete category image:", error);
    }
  }

  return { deleted: true, archived: false };
};

const uploadCategoryImage = async (
  id: string,
  image: {
    buffer: Buffer;
    contentType: string;
    extension: string;
    sizeBytes: number;
  },
) => {
  const category = await getCategoryOrThrow(id);
  const key = buildStorageKey(`categories/${id}`, image.extension);
  const uploaded = await activeImageStorage.upload({
    key,
    buffer: image.buffer,
    contentType: image.contentType,
  });

  try {
    const updated = await prisma.category.update({
      where: { id },
      data: {
        imageKey: uploaded.key,
        imageProvider: uploaded.provider,
      },
      select: categorySelect,
    });

    if (category.imageKey && category.imageProvider) {
      try {
        await storageForProvider(
          category.imageProvider as StorageProvider,
        ).delete(category.imageKey);
      } catch (error) {
        console.error("[STORAGE] Failed to delete old category image:", error);
      }
    }

    return mapCategory(updated);
  } catch (error) {
    try {
      await activeImageStorage.delete(uploaded.key);
    } catch (cleanupError) {
      console.error("[STORAGE] Failed to clean up category image:", cleanupError);
    }

    throw error;
  }
};

const removeCategoryImage = async (id: string) => {
  const category = await getCategoryOrThrow(id);

  if (!category.imageKey || !category.imageProvider) {
    return mapCategory(category);
  }

  const updated = await prisma.category.update({
    where: { id },
    data: { imageKey: null, imageProvider: null },
    select: categorySelect,
  });

  try {
    await storageForProvider(
      category.imageProvider as StorageProvider,
    ).delete(category.imageKey);
  } catch (error) {
    console.error("[STORAGE] Failed to delete category image:", error);
  }

  return mapCategory(updated);
};

export const CategoryService = {
  listPublicCategories,
  getPublicCategory,
  listAdminCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  uploadCategoryImage,
  removeCategoryImage,
};
