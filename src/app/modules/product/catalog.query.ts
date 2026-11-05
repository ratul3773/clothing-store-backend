import { Prisma } from "../../../generated/prisma/client";
import type { PublicProductQuery } from "./product.interface";

const inIds = (column: Prisma.Sql, ids: readonly string[]) =>
  ids.length ? Prisma.sql`${column} IN (${Prisma.join(ids)})` : Prisma.sql`FALSE`;

// Only identity and sort columns enter the union. Display relations are loaded
// after PostgreSQL has selected a single page across both catalog item types.
export const publicCatalogQuery = (
  query: PublicProductQuery,
  publicIds: readonly string[],
  categoryIds: readonly string[] | undefined,
  now: Date,
) => {
  const product = [Prisma.sql`p.status = 'ACTIVE' AND p."publishedAt" <= ${now}`,
    inIds(Prisma.sql`p."categoryId"`, categoryIds ?? publicIds)];
  const combo = [Prisma.sql`c."isActive" = TRUE
    AND (c."startsAt" IS NULL OR c."startsAt" <= ${now})
    AND (c."endsAt" IS NULL OR c."endsAt" > ${now})
    AND (SELECT SUM(ci.quantity) FROM combo_items ci WHERE ci."comboId" = c.id) BETWEEN 2 AND 3
    AND NOT EXISTS (
      SELECT 1 FROM combo_items ci
      JOIN product_colors pc ON pc.id = ci."colorId"
      JOIN products cp ON cp.id = pc."productId"
      WHERE ci."comboId" = c.id AND (
        ci.quantity < 1 OR ci.quantity > 3 OR NOT EXISTS (SELECT 1 FROM variants cv WHERE cv."colorId" = pc.id AND cv."productId" = pc."productId" AND cv."isActive"
          AND (cardinality(ci."variantIds") = 0 OR cv.id = ANY(ci."variantIds")))
        OR cp.status <> 'ACTIVE' OR cp."publishedAt" IS NULL OR cp."publishedAt" > ${now}
        OR NOT (${inIds(Prisma.sql`cp."categoryId"`, publicIds)})
      )
    )`];
  if (categoryIds) combo.push(Prisma.sql`EXISTS (
    SELECT 1 FROM combo_items ci JOIN product_colors pc ON pc.id = ci."colorId"
    JOIN products cp ON cp.id = pc."productId"
    WHERE ci."comboId" = c.id AND ${inIds(Prisma.sql`cp."categoryId"`, categoryIds)}
  )`);
  if (query.ids?.length) {
    product.push(inIds(Prisma.sql`p.id`, query.ids));
    combo.push(inIds(Prisma.sql`c.id`, query.ids));
  }
  if (query.q) {
    // Treat search text as literal text, including SQL wildcard characters.
    const term = query.q;
    product.push(Prisma.sql`(strpos(lower(p.name), lower(${term})) > 0
      OR strpos(lower(p.code), lower(${term})) > 0
      OR EXISTS (SELECT 1 FROM variants v WHERE v."productId" = p.id
        AND strpos(lower(v.sku), lower(${term})) > 0))`);
    combo.push(Prisma.sql`(strpos(lower(c.name), lower(${term})) > 0
      OR strpos(lower(c.description), lower(${term})) > 0
      OR EXISTS (SELECT 1 FROM combo_items ci JOIN product_colors pc ON pc.id = ci."colorId"
        JOIN products cp ON cp.id = pc."productId" WHERE ci."comboId" = c.id
        AND (strpos(lower(cp.name), lower(${term})) > 0
          OR strpos(lower(cp.code), lower(${term})) > 0
          OR EXISTS (SELECT 1 FROM variants cv WHERE cv."colorId" = pc.id AND cv."productId" = pc."productId" AND (cardinality(ci."variantIds") = 0 OR cv.id = ANY(ci."variantIds")) AND strpos(lower(cv.sku), lower(${term})) > 0))))`);
  }
  if (query.badge) {
    product.push(Prisma.sql`${query.badge}::"ProductBadge" = ANY(p.badges)`);
    if (query.badge !== "COMBO") combo.push(Prisma.sql`FALSE`);
  }
  if (query.minPrice !== undefined) {
    product.push(Prisma.sql`p."regularPrice" >= ${query.minPrice}`);
    combo.push(Prisma.sql`c.price >= ${query.minPrice}`);
  }
  if (query.maxPrice !== undefined) {
    product.push(Prisma.sql`p."regularPrice" <= ${query.maxPrice}`);
    combo.push(Prisma.sql`c.price <= ${query.maxPrice}`);
  }
  if (query.inStock !== undefined) {
    const available = query.inStock === "true";
    product.push(Prisma.sql`EXISTS (SELECT 1 FROM variants v WHERE v."productId" = p.id
      AND v."isActive" AND v."onHand" > v.reserved) = ${available}`);
    combo.push(Prisma.sql`NOT EXISTS (SELECT 1 FROM combo_items ci
      WHERE ci."comboId" = c.id
      AND NOT EXISTS (SELECT 1 FROM variants v WHERE v."colorId" = ci."colorId" AND v."productId" = (SELECT pc."productId" FROM product_colors pc WHERE pc.id = ci."colorId") AND v."isActive" AND (cardinality(ci."variantIds") = 0 OR v.id = ANY(ci."variantIds")) AND v."onHand" - v.reserved >= ci.quantity)) = ${available}`);
  }
  if (query.offers === "true") {
    product.push(Prisma.sql`EXISTS (SELECT 1 FROM product_offers o WHERE o."productId" = p.id
      AND o."isActive" AND o."startsAt" <= ${now} AND (o."endsAt" IS NULL OR o."endsAt" > ${now}))`);
    combo.push(Prisma.sql`FALSE`);
  }
  return Prisma.sql`
    SELECT p.id, 'PRODUCT' AS type, p.name, p."regularPrice" AS price,
      p."publishedAt", p."createdAt" FROM products p WHERE ${Prisma.join(product, " AND ")}
    UNION ALL
    SELECT c.id, 'COMBO' AS type, c.name, c.price,
      COALESCE(c."startsAt", c."createdAt") AS "publishedAt", c."createdAt"
      FROM combos c WHERE ${Prisma.join(combo, " AND ")}`;
};

export const publicCatalogOrder = (sort: PublicProductQuery["sort"]) => {
  switch (sort) {
    case "name_asc": return Prisma.sql`name ASC, type ASC, id ASC`;
    case "name_desc": return Prisma.sql`name DESC, type ASC, id ASC`;
    case "price_asc": return Prisma.sql`price ASC, name ASC, type ASC, id ASC`;
    case "price_desc": return Prisma.sql`price DESC, name ASC, type ASC, id ASC`;
    default: return Prisma.sql`"publishedAt" DESC NULLS LAST, "createdAt" DESC, type ASC, id ASC`;
  }
};
