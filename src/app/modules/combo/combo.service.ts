import { Prisma } from "../../../generated/prisma/client";
import ApiError from "../../../errors/ApiError";
import { prisma } from "../../../lib/prisma";
import { getPagination, buildPaginationMeta, type PaginationQuery } from "../../../utils/pagination";
import { buildUniqueSlug } from "../../../utils/slug";
import { getPublicCategoryIds } from "../product/catalog.rules";
import type { CreateComboInput, UpdateComboInput } from "./combo.interface";
import { mapCombo } from "./combo.mapper";
import { comboItemsError, lockCombo } from "./combo.rules";
import { comboInclude } from "./combo.select";

const publicWhere = async (tx: Prisma.TransactionClient): Promise<Prisma.ComboWhereInput> => {
  const now = new Date();
  return {
    isActive: true,
    AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
    items: {
      some: {},
      every: { variant: { isActive: true, product: { status: "ACTIVE", publishedAt: { lte: now }, categoryId: { in: [...await getPublicCategoryIds(tx)] } } } },
    },
  };
};

const assertVariants = async (tx: Prisma.TransactionClient, items: CreateComboInput["items"]) => {
  const error = comboItemsError(items);
  if (error) throw new ApiError(422, error);
  if (await tx.variant.count({ where: { id: { in: items.map((item) => item.variantId) } } }) !== items.length)
    throw new ApiError(422, "One or more combo variants do not exist");
};

const list = (query: PaginationQuery, admin = false) => prisma.$transaction(async (tx) => {
  const { page, limit, skip, take } = getPagination(query);
  const where = admin ? {} : await publicWhere(tx);
  const total = await tx.combo.count({ where });
  const rows = await tx.combo.findMany({ where, include: comboInclude, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip, take });
  return { data: rows.map(mapCombo), meta: buildPaginationMeta(total, page, limit) };
}, { isolationLevel: "RepeatableRead" });

const detail = (identifier: string, admin = false) => prisma.$transaction(async (tx) => {
  const combo = await tx.combo.findFirst({
    where: admin ? { id: identifier } : { ...await publicWhere(tx), slug: identifier }, include: comboInclude,
  });
  if (!combo) throw new ApiError(404, "Combo not found");
  return mapCombo(combo);
}, { isolationLevel: "RepeatableRead" });

const create = (input: CreateComboInput) => prisma.$transaction(async (tx) => {
  await assertVariants(tx, input.items);
  const slug = await buildUniqueSlug(input.name, async (slug) => Boolean(await tx.combo.findUnique({ where: { slug }, select: { id: true } })), "combo");
  const combo = await tx.combo.create({ data: {
    name: input.name, slug, description: input.description ?? null, price: input.price,
    startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null, isActive: input.isActive ?? true,
    items: { create: input.items },
  }, include: comboInclude });
  return mapCombo(combo);
});

const update = (id: string, input: UpdateComboInput) => prisma.$transaction(async (tx) => {
  await lockCombo(tx, id);
  const current = await tx.combo.findUniqueOrThrow({ where: { id }, include: comboInclude });
  const startsAt = input.startsAt === undefined ? current.startsAt : input.startsAt;
  const endsAt = input.endsAt === undefined ? current.endsAt : input.endsAt;
  if (startsAt && endsAt && startsAt >= endsAt) throw new ApiError(422, "startsAt must be before endsAt");
  let replaceItems = false;
  if (input.items) {
    const existing = new Map(current.items.map((item) => [item.variantId, item.quantity]));
    replaceItems = input.items.length !== existing.size || input.items.some((item) => existing.get(item.variantId) !== item.quantity);
    if (replaceItems) {
      if (await tx.cartCombo.count({ where: { comboId: id } })) throw new ApiError(409, "Combo contents cannot change while referenced by a cart. Deactivate it and create a new combo.");
      await assertVariants(tx, input.items);
      await tx.comboItem.deleteMany({ where: { comboId: id } });
    }
  }
  const data: Prisma.ComboUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.price !== undefined) data.price = input.price;
  if (input.startsAt !== undefined) data.startsAt = input.startsAt;
  if (input.endsAt !== undefined) data.endsAt = input.endsAt;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (replaceItems) data.items = { create: input.items! };
  return mapCombo(await tx.combo.update({ where: { id }, data, include: comboInclude }));
});

export const ComboService = { list, detail, create, update };
