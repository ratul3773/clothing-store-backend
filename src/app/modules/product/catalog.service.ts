import httpStatus from "http-status";
import { Prisma } from "../../../generated/prisma/client";
import { ProductBadge, ProductStatus } from "../../../generated/prisma/enums";
import ApiError from "../../../errors/ApiError";
import { prisma } from "../../../lib/prisma";
import {
  buildPaginationMeta,
  getPagination,
} from "../../../utils/pagination";
import { AdminProductQuery, PublicProductQuery } from "./product.interface";
import { mapAdminProduct, mapPublicProduct } from "./product.mapper";
import { productRelationsInclude } from "./product.select";

type CategoryNode = {
  id: string;
  parentId: string | null;
  slug: string;
  isActive: boolean;
};

const isPublicCategory = (
  category: CategoryNode,
  categories: Map<string, CategoryNode>,
) => {
  if (!category.isActive) return false;

  const visited = new Set<string>([category.id]);
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

const getPublicCategoryIds = async () => {
  const categories = await prisma.category.findMany({
    select: { id: true, parentId: true, slug: true, isActive: true },
  });
  const byId = new Map(categories.map((category) => [category.id, category]));

  return new Set(
    categories
      .filter((category) => isPublicCategory(category, byId))
      .map((category) => category.id),
  );
};

const getDescendantIds = (rootId: string, categories: CategoryNode[]) => {
  const children = new Map<string, string[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    const list = children.get(category.parentId) ?? [];
    list.push(category.id);
    children.set(category.parentId, list);
  }

  const result = new Set<string>();
  const queue = [rootId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (result.has(current)) continue;
    result.add(current);
    queue.push(...(children.get(current) ?? []));
  }

  return result;
};

const resolvePublicCategoryIds = async (slug: string) => {
  const publicIds = await getPublicCategoryIds();
  const category = await prisma.category.findUnique({
    where: { slug },
    select: { id: true, parentId: true, slug: true, isActive: true },
  });

  if (!category || !publicIds.has(category.id)) {
    throw new ApiError(httpStatus.NOT_FOUND, "Category not found");
  }

  const categories = await prisma.category.findMany({
    select: { id: true, parentId: true, slug: true, isActive: true },
  });
  const descendants = getDescendantIds(category.id, categories);

  return new Set([...descendants].filter((id) => publicIds.has(id)));
};

const resolveAdminCategoryIds = async (slug: string) => {
  const category = await prisma.category.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!category) {
    throw new ApiError(httpStatus.NOT_FOUND, "Category not found");
  }

  const categories = await prisma.category.findMany({
    select: { id: true, parentId: true, slug: true, isActive: true },
  });

  return getDescendantIds(category.id, categories);
};

const availableVariantProductIds = async () => {
  const rows = await prisma.$queryRaw<Array<{ productId: string }>>`
    SELECT DISTINCT "productId"
    FROM "variants"
    WHERE "isActive" = true
      AND ("onHand" - "reserved") > 0
  `;

  return rows.map((row) => row.productId);
};

const publicOrderBy = (
  sort: PublicProductQuery["sort"],
): Prisma.ProductOrderByWithRelationInput[] => {
  switch (sort) {
    case "name_asc":
      return [{ name: "asc" }];
    case "name_desc":
      return [{ name: "desc" }];
    case "price_asc":
      return [{ regularPrice: "asc" }, { name: "asc" }];
    case "price_desc":
      return [{ regularPrice: "desc" }, { name: "asc" }];
    case "newest":
    default:
      return [
        { publishedAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ];
  }
};

const adminOrderBy = (
  sort: AdminProductQuery["sort"],
): Prisma.ProductOrderByWithRelationInput[] => {
  if (sort === "updated_desc") {
    return [{ updatedAt: "desc" }];
  }

  return publicOrderBy(sort);
};

const listPublicProducts = async (query: PublicProductQuery) => {
  const { page, limit, skip, take } = getPagination(query);
  const now = new Date();
  const where: Prisma.ProductWhereInput = {
    status: ProductStatus.ACTIVE,
    publishedAt: { lte: now },
    categoryId: { in: [...(await getPublicCategoryIds())] },
  };

  if (query.category) {
    where.categoryId = { in: [...(await resolvePublicCategoryIds(query.category))] };
  }

  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { code: { contains: query.q, mode: "insensitive" } },
      {
        variants: {
          some: { sku: { contains: query.q, mode: "insensitive" } },
        },
      },
    ];
  }

  if (query.badge) {
    where.badges = { has: query.badge as ProductBadge };
  }

  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    where.regularPrice = {
      ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
      ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
    };
  }

  if (query.inStock !== undefined) {
    const availableIds = await availableVariantProductIds();
    where.id =
      query.inStock === "true"
        ? { in: availableIds }
        : { notIn: availableIds };
  }

  if (query.offers === "true") {
    where.offers = {
      some: {
        isActive: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
    };
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: productRelationsInclude,
      orderBy: publicOrderBy(query.sort),
      skip,
      take,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    data: products.map((product) => mapPublicProduct(product)),
    meta: buildPaginationMeta(total, page, limit),
  };
};

const getPublicProduct = async (slug: string) => {
  const publicCategoryIds = await getPublicCategoryIds();
  const product = await prisma.product.findFirst({
    where: {
      slug,
      status: ProductStatus.ACTIVE,
      publishedAt: { lte: new Date() },
      categoryId: { in: [...publicCategoryIds] },
    },
    include: productRelationsInclude,
  });

  if (!product) {
    throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
  }

  return mapPublicProduct(product);
};

const listAdminProducts = async (query: AdminProductQuery) => {
  const { page, limit, skip, take } = getPagination(query);
  const where: Prisma.ProductWhereInput = {};

  if (query.status) where.status = query.status;
  if (query.categoryId) where.categoryId = query.categoryId;

  if (query.category) {
    where.categoryId = {
      in: [...(await resolveAdminCategoryIds(query.category))],
    };
  }

  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { code: { contains: query.q, mode: "insensitive" } },
      {
        variants: {
          some: { sku: { contains: query.q, mode: "insensitive" } },
        },
      },
    ];
  }

  if (query.badge) {
    where.badges = { has: query.badge as ProductBadge };
  }

  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    where.regularPrice = {
      ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
      ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
    };
  }

  if (query.inStock !== undefined) {
    const availableIds = await availableVariantProductIds();
    where.id =
      query.inStock === "true"
        ? { in: availableIds }
        : { notIn: availableIds };
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: productRelationsInclude,
      orderBy: adminOrderBy(query.sort),
      skip,
      take,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    data: products.map((product) => mapAdminProduct(product)),
    meta: buildPaginationMeta(total, page, limit),
  };
};

export const CatalogService = {
  listPublicProducts,
  getPublicProduct,
  listAdminProducts,
};
