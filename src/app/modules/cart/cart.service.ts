import { Prisma } from "../../../generated/prisma/client";
import ApiError from "../../../errors/ApiError";
import { prisma } from "../../../lib/prisma";
import { paginationHelpers, type TPaginationOptions } from "../../../helpers/paginationHelper";
import { buildPaginationMeta } from "../../../utils/pagination";
import { getPublicCategoryIds, isVariantPublic } from "../product/catalog.rules";
import { isComboPublic, lockCombo } from "../combo/combo.rules";
import { comboAvailabilitySelect } from "../combo/combo.select";
import { CART_QUANTITY_STORAGE_MAX } from "./cart.constants";
import type { AddCartItemInput, AddCartComboInput, CartOwner, UpdateCartItemInput } from "./cart.interface";
import { mapCart } from "./cart.mapper";
import { demandForLines, hydrateCart, loadDemandLines, pageCartIds, remainingCapacity, type DemandLine } from "./cart.lines";
import { variantAvailabilitySelect } from "./cart.select";
import { lockCustomer, lockGuest, normalizeOwner, ownerWhere } from "./cart.repository";

const mutationSelect = {
  id: true, version: true,
  items: { select: { id: true, variantId: true, quantity: true } },
  combos: { select: { id: true, comboId: true, quantity: true } },
} satisfies Prisma.CartSelect;
type MutationCart = Prisma.CartGetPayload<{ select: typeof mutationSelect }>;

const getCart = (owner: CartOwner | string, pagination: TPaginationOptions = {}) => {
  const resolved = normalizeOwner(owner);
  const options = paginationHelpers.calculatePagination(pagination);
  if (resolved.kind === "none") return Promise.resolve({
    data: { ...mapCart(null, new Set(), new Date()), selectionItems: [] },
    meta: buildPaginationMeta(0, 1, options.limit),
  });
  return prisma.$transaction(async (tx) => {
    const header = await tx.cart.findFirst({ where: ownerWhere(resolved), select: { id: true, version: true } });
    const publicIds = header ? await getPublicCategoryIds(tx) : new Set<string>();
    const now = new Date();
    const lines = header ? await loadDemandLines(tx, header.id, publicIds, now) : [];
    const page = Math.min(options.page, Math.max(1, Math.ceil(lines.length / options.limit)));
    const { skip, limit } = paginationHelpers.calculatePagination({ page, limit: options.limit });
    const ids = header ? await pageCartIds(tx, header.id, skip, limit) : [];
    return { data: await hydrateCart(tx, header, lines, publicIds, now, ids), meta: buildPaginationMeta(lines.length, page, limit) };
  }, { isolationLevel: "RepeatableRead" });
};

const assertQuantity = (quantity: number) => {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > CART_QUANTITY_STORAGE_MAX)
    throw new ApiError(422, "Quantity must be a positive integer within the database storage range");
};

const ensureCart = async (tx: Prisma.TransactionClient, cart: MutationCart | null, owner: CartOwner) => {
  if (cart) return cart.id;
  if (owner.kind === "user") {
    const customer = await tx.customer.upsert({ where: { userId: owner.userId }, create: { userId: owner.userId }, update: {} });
    return (await tx.cart.create({ data: { customerId: customer.id } })).id;
  }
  if (owner.kind === "newGuest") return (await tx.cart.create({ data: { guestTokenHash: owner.tokenHash } })).id;
  throw new ApiError(409, "Reload your cart before adding items");
};

const mutate = (inputOwner: CartOwner | string, version: number,
  action: (tx: Prisma.TransactionClient, cart: MutationCart | null, owner: CartOwner) => Promise<string | null>) =>
  retryCartTransaction(async () => prisma.$transaction(async (tx) => {
    const owner = normalizeOwner(inputOwner);
    if (owner.kind === "user") await lockCustomer(tx, owner.userId);
    if (owner.kind === "guest" && !(await lockGuest(tx, owner.cartId, owner.tokenHash)))
      throw new ApiError(409, "Guest cart expired or changed. Reload your cart.");
    const cart = await tx.cart.findFirst({ where: ownerWhere(owner), select: mutationSelect });
    if ((cart?.version ?? 0) !== version) throw new ApiError(409, "Cart was modified by another request. Reload your cart and try again.");
    const cartId = await action(tx, cart, owner);
    const header = cartId ? await tx.cart.update({ where: { id: cartId }, data: { version: { increment: 1 } }, select: { id: true, version: true } }) : null;
    const publicIds = header ? await getPublicCategoryIds(tx) : new Set<string>();
    const now = new Date();
    const lines = header ? await loadDemandLines(tx, header.id, publicIds, now) : [];
    const ids = header ? await pageCartIds(tx, header.id, 0, lines.length) : [];
    return hydrateCart(tx, header, lines, publicIds, now, ids);
  }, { isolationLevel: "RepeatableRead" }));

// Keep summary prices/availability and page hydration in one snapshot. A waiter
// may need a new snapshot after another cart or combo writer commits.
const retryCartTransaction = async <T>(run: () => Promise<T>): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try { return await run(); }
    catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" || (error.code === "P2010" && error.meta?.code === "40001"));
      if (!retryable) throw error;
      if (attempt >= 2) throw new ApiError(409, "Cart or catalogue changed concurrently. Reload your cart and try again.");
    }
  }
};

const assertStock = async (tx: Prisma.TransactionClient, cartId: string | undefined,
  components: DemandLine["components"], quantity: number, exclude?: string) => {
  const lines = cartId ? await loadDemandLines(tx, cartId, await getPublicCategoryIds(tx), new Date()) : [];
  if (quantity > remainingCapacity(components, demandForLines(lines, exclude)))
    throw new ApiError(409, "Requested quantity exceeds available stock across cart items and combos");
};

const addItem = (owner: CartOwner | string, input: AddCartItemInput) => mutate(owner, input.version, async (tx, cart, resolved) => {
  const existing = cart?.items.find((item) => item.variantId === input.variantId);
  assertQuantity(input.quantity);
  const quantity = (existing?.quantity ?? 0) + input.quantity;
  assertQuantity(quantity);
  const variant = await tx.variant.findUnique({ where: { id: input.variantId }, select: variantAvailabilitySelect });
  if (!variant || !isVariantPublic(variant, await getPublicCategoryIds(tx), new Date())) throw new ApiError(404, "Variant is not available");
  await assertStock(tx, cart?.id, [{ variantId: variant.id, quantity: 1, variant }], quantity, existing?.id);
  const cartId = await ensureCart(tx, cart, resolved);
  if (existing) await tx.cartItem.update({ where: { id: existing.id }, data: { quantity } });
  else await tx.cartItem.create({ data: { cartId, variantId: variant.id, quantity } });
  return cartId;
});

const addCombo = (owner: CartOwner | string, input: AddCartComboInput) => mutate(owner, input.version, async (tx, cart, resolved) => {
  const existing = cart?.combos.find((item) => item.comboId === input.comboId);
  assertQuantity(input.quantity);
  const quantity = (existing?.quantity ?? 0) + input.quantity;
  assertQuantity(quantity);
  await lockCombo(tx, input.comboId);
  const combo = await tx.combo.findUniqueOrThrow({ where: { id: input.comboId }, select: comboAvailabilitySelect });
  if (!isComboPublic(combo, await getPublicCategoryIds(tx), new Date())) throw new ApiError(404, "Combo is not available");
  await assertStock(tx, cart?.id, combo.items, quantity, existing?.id);
  const cartId = await ensureCart(tx, cart, resolved);
  if (existing) await tx.cartCombo.update({ where: { id: existing.id }, data: { quantity } });
  else await tx.cartCombo.create({ data: { cartId, comboId: combo.id, quantity } });
  return cartId;
});

const updateLine = (type: "VARIANT" | "COMBO", owner: CartOwner | string, itemId: string, input: UpdateCartItemInput) =>
  mutate(owner, input.version, async (tx, cart) => {
    const item = type === "VARIANT" ? cart?.items.find((item) => item.id === itemId) : cart?.combos.find((item) => item.id === itemId);
    if (!item || !cart) throw new ApiError(404, "Cart item not found");
    assertQuantity(input.quantity);
    if (input.quantity > item.quantity) {
      const lines = await loadDemandLines(tx, cart.id, await getPublicCategoryIds(tx), new Date());
      const line = lines.find((line) => line.id === itemId)!;
      if (!line.eligible) throw new ApiError(404, "Item is not available");
      if (input.quantity > remainingCapacity(line.components, demandForLines(lines, itemId))) throw new ApiError(409, "Requested quantity exceeds available stock across cart items and combos");
    }
    if (type === "VARIANT") await tx.cartItem.update({ where: { id: itemId }, data: { quantity: input.quantity } });
    else await tx.cartCombo.update({ where: { id: itemId }, data: { quantity: input.quantity } });
    return cart.id;
  });

const removeLine = (type: "VARIANT" | "COMBO", owner: CartOwner | string, itemId: string, version: number) =>
  mutate(owner, version, async (tx, cart) => {
    const exists = type === "VARIANT" ? cart?.items.some((item) => item.id === itemId) : cart?.combos.some((item) => item.id === itemId);
    if (!exists || !cart) throw new ApiError(404, "Cart item not found");
    if (type === "VARIANT") await tx.cartItem.delete({ where: { id: itemId } });
    else await tx.cartCombo.delete({ where: { id: itemId } });
    return cart.id;
  });

const clearCart = (owner: CartOwner | string, version: number) => mutate(owner, version, async (tx, cart) => {
  if (!cart) return null;
  await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
  await tx.cartCombo.deleteMany({ where: { cartId: cart.id } });
  return cart.id;
});

export const CartService = {
  getCart, addItem, addCombo, clearCart,
  updateItem: (owner: CartOwner | string, itemId: string, input: UpdateCartItemInput) => updateLine("VARIANT", owner, itemId, input),
  updateCombo: (owner: CartOwner | string, itemId: string, input: UpdateCartItemInput) => updateLine("COMBO", owner, itemId, input),
  removeItem: (owner: CartOwner | string, itemId: string, version: number) => removeLine("VARIANT", owner, itemId, version),
  removeCombo: (owner: CartOwner | string, itemId: string, version: number) => removeLine("COMBO", owner, itemId, version),
};
