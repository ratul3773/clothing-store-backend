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
import { getPublicCategoryIds as loadPublicCategoryIds } from "./catalog.rules";
import { publicCatalogQuery, publicCatalogOrder } from "./catalog.query";
import { mapComboProduct } from "./catalog.mapper";
import { comboInclude } from "../combo/combo.select";

type CategoryNode = {
  id: string;
  parentId: string | null;
  slug: string;
  isActive: boolean;
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

type CatalogIdentity = { id: string; type: "PRODUCT" | "COMBO" };

const listPublicProducts = async (query: PublicProductQuery) => {
  const { page, limit, skip, take } = getPagination(query);
  // Resolve the category subtree once; all catalog reads share one snapshot.
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const publicIds = await loadPublicCategoryIds(tx);
    let categoryIds: string[] | undefined;
    if (query.category) {
      const categories = await tx.category.findMany({
        select: { id: true, parentId: true, slug: true, isActive: true },
      });
      const root = categories.find((category) => category.slug === query.category);
      if (!root || !publicIds.has(root.id)) throw new ApiError(404, "Category not found");
      categoryIds = [...getDescendantIds(root.id, categories)].filter((id) => publicIds.has(id));
    }
    const collection = publicCatalogQuery(query, [...publicIds], categoryIds, now);
    const [count] = await tx.$queryRaw<Array<{ total: bigint }>>(
      Prisma.sql`SELECT COUNT(*) AS total FROM (${collection}) catalog`,
    );
    const total = Number(count!.total);
    // Clamp a stale page after a deletion, keeping the empty-list contract.
    const actualPage = total > 0 ? Math.min(page, Math.ceil(total / limit)) : 1;
    const offset = actualPage === page ? skip : (actualPage - 1) * limit;
    const rows = await tx.$queryRaw<CatalogIdentity[]>(Prisma.sql`
      SELECT id, type FROM (${collection}) catalog
      ORDER BY ${publicCatalogOrder(query.sort)} OFFSET ${offset} LIMIT ${take}`);
    const productIds = rows.filter((row) => row.type === "PRODUCT").map((row) => row.id);
    const comboIds = rows.filter((row) => row.type === "COMBO").map((row) => row.id);
    const [products, combos] = await Promise.all([
      productIds.length ? tx.product.findMany({ where: { id: { in: productIds } }, include: productRelationsInclude }) : [],
      comboIds.length ? tx.combo.findMany({ where: { id: { in: comboIds } }, include: comboInclude }) : [],
    ]);
    const mapped = new Map<string, ReturnType<typeof mapPublicProduct> | ReturnType<typeof mapComboProduct>>([
      ...products.map((product) => [`PRODUCT:${product.id}`, mapPublicProduct(product, now)] as const),
      ...combos.map((combo) => [`COMBO:${combo.id}`, mapComboProduct(combo)] as const),
    ]);
    return {
      data: rows.map((row) => mapped.get(`${row.type}:${row.id}`)!),
      meta: buildPaginationMeta(total, actualPage, limit),
    };
  }, { isolationLevel: "RepeatableRead" });
};

const getPublicProduct = async (slug: string) => prisma.$transaction(async (tx) => {
  const now = new Date();
  const publicCategoryIds = await loadPublicCategoryIds(tx);
  if (slug.startsWith("combo--")) {
    const id = slug.slice("combo--".length);
    const collection = publicCatalogQuery({ ids: [id] }, [...publicCategoryIds], undefined, now);
    const eligible = await tx.$queryRaw<CatalogIdentity[]>(
      Prisma.sql`SELECT id, type FROM (${collection}) catalog WHERE type = 'COMBO'`,
    );
    if (!eligible.length) throw new ApiError(404, "Product not found");
    const combo = await tx.combo.findUniqueOrThrow({ where: { id }, include: comboInclude });
    return mapComboProduct(combo);
  }
  const product = await tx.product.findFirst({
    where: {
      slug, status: ProductStatus.ACTIVE, publishedAt: { lte: now },
      categoryId: { in: [...publicCategoryIds] },
    },
    include: productRelationsInclude,
  });
  if (!product) throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
  return mapPublicProduct(product, now);
}, { isolationLevel: "RepeatableRead" });

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
