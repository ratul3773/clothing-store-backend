import { Prisma } from "../../../generated/prisma/client";
import { cartInclude } from "./cart.select";
import { comboInclude } from "../combo/combo.select";

export const cartSnapshotItemInclude = {
  variant: {
    include: {
      ...cartInclude.items.include.variant.include,
    },
  },
} satisfies Prisma.CartItemInclude;

export const cartSnapshotComboInclude = {
  combo: {
    include: comboInclude,
  },
  selections: {
    include: {
      variant: {
        select: {
          size: true,
        },
      },
    },
  },
} satisfies Prisma.CartComboInclude;

export type SnapshotItem = Prisma.CartItemGetPayload<{
  include: typeof cartSnapshotItemInclude;
}>;

export type SnapshotCombo = Prisma.CartComboGetPayload<{
  include: typeof cartSnapshotComboInclude;
}>;

export type CartSnapshot = {
  items: SnapshotItem[];
  combos: SnapshotCombo[];
};

// Prisma stores DateTime as UTC in timestamp-without-time-zone columns, so JSON
// values carry no offset and must be read as UTC, not as the server's locale.
const utcDate = (text: string) =>
  new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text}Z`);

const reviveDates = (value: unknown): unknown => {
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(reviveDates);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        typeof entry === "string" && key.endsWith("At")
          ? utcDate(entry)
          : reviveDates(entry),
      ]),
    );
  return value;
};

// The whole cart graph in one round trip: every extra relation level is another
// ~55ms to the remote database.
export const loadCartSnapshot = async (
  db: Prisma.TransactionClient,
  cartId: string,
): Promise<CartSnapshot> => {
  const [row] = await db.$queryRaw<Array<{ snapshot?: unknown }>>`
    SELECT json_build_object(
      'items', COALESCE((
        SELECT json_agg(row_to_json(line) ORDER BY line."createdAt" ASC, line.id ASC)
        FROM (
          SELECT
            ci.id, ci."cartId", ci."variantId", ci.quantity,
            ci."createdAt", ci."updatedAt",
            json_build_object(
              'id', v.id, 'productId', v."productId", 'colorId', v."colorId",
              'size', v.size, 'sizeOrder', v."sizeOrder", 'sku', v.sku,
              'onHand', v."onHand", 'reserved', v.reserved,
              'lowStockThreshold', v."lowStockThreshold", 'isActive', v."isActive",
              'version', v.version, 'createdAt', v."createdAt", 'updatedAt', v."updatedAt",
              'color', json_build_object('name', pc.name),
              'product', json_build_object(
                'id', p.id, 'name', p.name, 'slug', p.slug, 'status', p.status,
                'publishedAt', p."publishedAt", 'categoryId', p."categoryId",
                'regularPrice', p."regularPrice",
                'offers', COALESCE((
                  SELECT json_agg(json_build_object(
                    'offerPrice', o."offerPrice", 'startsAt', o."startsAt",
                    'endsAt', o."endsAt", 'isActive', o."isActive"
                  ))
                  FROM product_offers o WHERE o."productId" = p.id
                ), '[]'::json),
                'images', COALESCE((
                  SELECT json_agg(json_build_object(
                    'colorId', img."colorId", 'storageKey', img."storageKey",
                    'provider', img.provider, 'isPrimary', img."isPrimary"
                  ) ORDER BY img."isPrimary" DESC, img."sortOrder" ASC, img.id ASC)
                  FROM product_images img WHERE img."productId" = p.id
                ), '[]'::json)
              )
            ) AS variant
          FROM cart_items ci
          JOIN variants v ON v.id = ci."variantId"
          JOIN product_colors pc ON pc.id = v."colorId"
          JOIN products p ON p.id = v."productId"
          WHERE ci."cartId" = ${cartId}
        ) line
      ), '[]'::json),
      'combos', COALESCE((
        SELECT json_agg(row_to_json(line) ORDER BY line."createdAt" ASC, line.id ASC)
        FROM (
          SELECT
            cc.id, cc."cartId", cc."comboId", cc.quantity,
            cc."selectionKey", cc."createdAt",
            json_build_object(
              'id', c.id, 'name', c.name, 'slug', c.slug, 'description', c.description,
              'price', c.price, 'imageKey', c."imageKey", 'startsAt', c."startsAt",
              'endsAt', c."endsAt", 'isActive', c."isActive",
              'createdAt', c."createdAt", 'updatedAt', c."updatedAt",
              'items', COALESCE((
                SELECT json_agg(row_to_json(piece) ORDER BY piece.id ASC)
                FROM (
                  SELECT
                    cii.id, cii."comboId", cii."colorId", cii.quantity, cii."variantIds",
                    json_build_object(
                      'id', pc2.id, 'name', pc2.name, 'hex', pc2.hex,
                      'product', json_build_object(
                        'id', p2.id, 'name', p2.name, 'slug', p2.slug, 'status', p2.status,
                        'publishedAt', p2."publishedAt", 'categoryId', p2."categoryId",
                        'regularPrice', p2."regularPrice",
                        'offers', COALESCE((
                          SELECT json_agg(json_build_object(
                            'offerPrice', o2."offerPrice", 'startsAt', o2."startsAt",
                            'endsAt', o2."endsAt", 'isActive', o2."isActive"
                          ))
                          FROM product_offers o2 WHERE o2."productId" = p2.id
                        ), '[]'::json),
                        'images', COALESCE((
                          SELECT json_agg(json_build_object(
                            'colorId', img2."colorId", 'storageKey', img2."storageKey",
                            'provider', img2.provider, 'isPrimary', img2."isPrimary"
                          ) ORDER BY img2."isPrimary" DESC, img2."sortOrder" ASC, img2.id ASC)
                          FROM product_images img2 WHERE img2."productId" = p2.id
                        ), '[]'::json)
                      ),
                      'variants', COALESCE((
                        SELECT json_agg(json_build_object(
                          'id', v2.id, 'productId', v2."productId", 'colorId', v2."colorId",
                          'size', v2.size, 'sizeOrder', v2."sizeOrder",
                          'onHand', v2."onHand", 'reserved', v2.reserved,
                          'lowStockThreshold', v2."lowStockThreshold", 'isActive', v2."isActive"
                        ) ORDER BY v2."sizeOrder" ASC, v2.size ASC, v2.id ASC)
                        FROM variants v2 WHERE v2."colorId" = pc2.id
                      ), '[]'::json)
                    ) AS color
                  FROM combo_items cii
                  JOIN product_colors pc2 ON pc2.id = cii."colorId"
                  JOIN products p2 ON p2.id = pc2."productId"
                  WHERE cii."comboId" = c.id
                ) piece
              ), '[]'::json)
            ) AS combo,
            COALESCE((
              SELECT json_agg(json_build_object(
                'cartComboId', s."cartComboId", 'comboItemId', s."comboItemId",
                'variantId', s."variantId",
                'variant', json_build_object('size', sv.size)
              ))
              FROM cart_combo_selections s
              JOIN variants sv ON sv.id = s."variantId"
              WHERE s."cartComboId" = cc.id
            ), '[]'::json) AS selections
          FROM cart_combos cc
          JOIN combos c ON c.id = cc."comboId"
          WHERE cc."cartId" = ${cartId}
        ) line
      ), '[]'::json)
    ) AS snapshot
  `;

  if (!row || !row.snapshot)
    throw new Error("Cart snapshot query returned no payload");
  return reviveDates(row.snapshot) as CartSnapshot;
};
