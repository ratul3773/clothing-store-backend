import { Prisma } from "../../../generated/prisma/client";
import ApiError from "../../../errors/ApiError";
import { prisma } from "../../../lib/prisma";
import { getPagination, buildPaginationMeta, type PaginationQuery } from "../../../utils/pagination";
import { buildUniqueSlug } from "../../../utils/slug";
import { getPublicCategoryIds } from "../product/catalog.rules";
import type { CreateComboInput, UpdateComboInput } from "./combo.interface";
import { mapCombo } from "./combo.mapper";
import { comboItemsError, lockCombo } from "./combo.rules";
import { comboInclude, comboColorSelect } from "./combo.select";
import { comboPricing } from "./combo.pricing";

const publicWhere = async (tx: Prisma.TransactionClient, publicIds?: ReadonlySet<string>): Promise<Prisma.ComboWhereInput> => {
  const now = new Date();
  const unavailable = await tx.$queryRaw<Array<{ comboId: string }>>`
    SELECT DISTINCT ci."comboId" FROM combo_items ci
    JOIN product_colors pc ON pc.id = ci."colorId"
    WHERE cardinality(ci."variantIds") > 0 AND NOT EXISTS (
      SELECT 1 FROM variants v WHERE v.id = ANY(ci."variantIds")
      AND v."colorId" = pc.id AND v."productId" = pc."productId" AND v."isActive"
    )`;
  return {
    id: { notIn: unavailable.map(({ comboId }) => comboId) },
    isActive: true,
    AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
    items: {
      some: {},
      every: {
        color: { product: { status: "ACTIVE", publishedAt: { lte: now }, categoryId: { in: [...(publicIds ?? await getPublicCategoryIds(tx))] } }, variants: { some: { isActive: true } } },
      },
    },
  };
};

const assertColors = async (tx: Prisma.TransactionClient, items: CreateComboInput["items"]) => {
  const error = comboItemsError(items);
  if (error) throw new ApiError(422, error);
  const colors = await tx.productColor.findMany({
    where: { id: { in: items.map((item) => item.colorId) } }, select: comboColorSelect,
  });
  if (colors.length !== items.length) throw new ApiError(422, "One or more product colors do not exist");
  const byId = new Map(colors.map((color) => [color.id, color]));
  return items.map((item) => {
    const color = byId.get(item.colorId)!;
    if (item.variantIds?.some((id) => !color.variants.some((variant) => variant.id === id && variant.productId === color.product.id)))
      throw new ApiError(422, "Selected variants must belong to the component's product and color");
    return { ...item, color };
  });
};

const persistedItems = (items: CreateComboInput["items"]) => items.map((item) => ({
  colorId: item.colorId, quantity: item.quantity, variantIds: item.variantIds ?? [],
}));
const variantKey = (ids: readonly string[] | null | undefined) => JSON.stringify([...(ids ?? [])].sort());

const assertDiscount = (items: Parameters<typeof comboPricing>[0], price: number) => {
  const { combinedPrice } = comboPricing(items, price, new Date());
  if (price >= combinedPrice) throw new ApiError(422, "Combo price must be lower than the combined current price of its items");
};

const list = (query: PaginationQuery, admin = false) => prisma.$transaction(async (tx) => {
  const { page, limit, skip, take } = getPagination(query);
  const publicIds = await getPublicCategoryIds(tx);
  const where = admin ? {} : await publicWhere(tx, publicIds);
  const total = await tx.combo.count({ where });
  const rows = await tx.combo.findMany({ where, include: comboInclude, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip, take });
  const now = new Date();
  return { data: rows.map((row) => mapCombo(row, now, publicIds, admin)), meta: buildPaginationMeta(total, page, limit) };
}, { isolationLevel: "RepeatableRead" });

const detail = (identifier: string, admin = false) => prisma.$transaction(async (tx) => {
  const publicIds = await getPublicCategoryIds(tx);
  const combo = await tx.combo.findFirst({
    where: admin ? { id: identifier } : { ...await publicWhere(tx, publicIds), slug: identifier }, include: comboInclude,
  });
  if (!combo) throw new ApiError(404, "Combo not found");
  return mapCombo(combo, new Date(), publicIds, admin);
}, { isolationLevel: "RepeatableRead" });

const create = (input: CreateComboInput) => prisma.$transaction(async (tx) => {
  assertDiscount(await assertColors(tx, input.items), input.price);
  const slug = await buildUniqueSlug(input.name, async (slug) => Boolean(await tx.combo.findUnique({ where: { slug }, select: { id: true } })), "combo");
  const combo = await tx.combo.create({ data: {
    name: input.name, slug, description: input.description ?? null, price: input.price,
    startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null, isActive: input.isActive ?? true,
    items: { create: persistedItems(input.items) },
  }, include: comboInclude });
  return mapCombo(combo, new Date(), await getPublicCategoryIds(tx), true);
});

const update = (id: string, input: UpdateComboInput) => prisma.$transaction(async (tx) => {
  await lockCombo(tx, id);
  const current = await tx.combo.findUniqueOrThrow({ where: { id }, include: comboInclude });
  const startsAt = input.startsAt === undefined ? current.startsAt : input.startsAt;
  const endsAt = input.endsAt === undefined ? current.endsAt : input.endsAt;
  if (startsAt && endsAt && startsAt >= endsAt) throw new ApiError(422, "startsAt must be before endsAt");
  let replaceItems = false;
  let pricingItems: Parameters<typeof comboPricing>[0] = current.items;
  if (input.items) {
    const existing = new Map(current.items.map((item) => [item.colorId, item]));
    replaceItems = input.items.length !== existing.size || input.items.some((item) => {
      const previous = existing.get(item.colorId);
      return !previous || previous.quantity !== item.quantity || variantKey(previous.variantIds) !== variantKey(item.variantIds);
    });
    if (replaceItems) {
      if (await tx.cartCombo.count({ where: { comboId: id } })) throw new ApiError(409, "Combo contents cannot change while referenced by a cart. Deactivate it and create a new combo.");
      pricingItems = await assertColors(tx, input.items);
    }
  }
  // Deactivation must remain possible if a later product offer removes savings.
  const deactivationOnly = input.isActive === false && Object.keys(input).length === 1;
  if (!deactivationOnly) assertDiscount(pricingItems, input.price ?? current.price);
  if (replaceItems) await tx.comboItem.deleteMany({ where: { comboId: id } });
  const data: Prisma.ComboUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.price !== undefined) data.price = input.price;
  if (input.startsAt !== undefined) data.startsAt = input.startsAt;
  if (input.endsAt !== undefined) data.endsAt = input.endsAt;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (replaceItems) data.items = { create: persistedItems(input.items!) };
  return mapCombo(await tx.combo.update({ where: { id }, data, include: comboInclude }), new Date(), await getPublicCategoryIds(tx), true);
});

export const ComboService = { list, detail, create, update };
