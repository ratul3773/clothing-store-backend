import httpStatus from "http-status";
import { Prisma, PrismaClient } from "../../../generated/prisma/client";
import ApiError from "../../../errors/ApiError";
import { prisma } from "../../../lib/prisma";
import { paginationHelpers, type TPaginationOptions } from "../../../helpers/paginationHelper";
import { buildPaginationMeta } from "../../../utils/pagination";
import { getPublicCategoryIds } from "../product/catalog.rules";
import { CART_QUANTITY_STORAGE_MAX } from "./cart.constants";
import {
  AddCartItemInput,
  CartOwner,
  UpdateCartItemInput,
} from "./cart.interface";
import { getCartItemStatus, mapCart, mapCartSummary } from "./cart.mapper";
import {
  cartInclude,
  cartSummarySelect,
  CartWithItems,
  variantAvailabilitySelect,
} from "./cart.select";
import {
  lockCustomer,
  lockGuest,
  normalizeOwner,
  ownerWhere,
} from "./cart.repository";

const mutationSelect = {
  id: true,
  version: true,
  items: { select: { id: true, variantId: true, quantity: true } },
} satisfies Prisma.CartSelect;
type MutationCart = Prisma.CartGetPayload<{ select: typeof mutationSelect }>;

const resultFor = async (
  tx: Prisma.TransactionClient,
  cart: CartWithItems | null,
) =>
  mapCart(
    cart,
    cart?.items.length ? await getPublicCategoryIds(tx) : new Set(),
    new Date(),
  );

// Injectable client lets integration tests use a dedicated PostgreSQL schema.
  const getCart = (owner: CartOwner | string, pagination: TPaginationOptions = {}) => {
    const resolved = normalizeOwner(owner);
    const options = paginationHelpers.calculatePagination(pagination);
    if (resolved.kind === "none")
      return Promise.resolve({
        data: { ...mapCart(null, new Set(), new Date()), selectionItems: [] },
        meta: buildPaginationMeta(0, 1, options.limit),
      });
    return prisma.$transaction(
      async (tx) => {
        const header = await tx.cart.findFirst({ where: ownerWhere(resolved), select: { id: true, version: true } });
        const summaryLines = header ? await tx.cartItem.findMany({ where: { cartId: header.id }, select: cartSummarySelect }) : [];
        const publicIds = summaryLines.length ? await getPublicCategoryIds(tx) : new Set<string>();
        const now = new Date();
        const summary = mapCartSummary(summaryLines, publicIds, now);
        const meta = buildPaginationMeta(summary.distinctItemCount, options.page, options.limit);
        const totalPages = Math.max(1, meta.totalPage);
        const { page: currentPage, limit, skip } = paginationHelpers.calculatePagination({
          page: Math.min(meta.page, totalPages),
          limit: meta.limit,
        });
        const cart = header ? await tx.cart.findUnique({
          where: { id: header.id },
          include: { items: { ...cartInclude.items, skip, take: limit } },
        }) : null;
        return {
          data: { ...mapCart(cart, publicIds, now), ...summary },
          meta: buildPaginationMeta(meta.total, currentPage, limit),
        };
      },
      {
        isolationLevel: "RepeatableRead",
      },
    );
  };

  const assertVersion = (actual: number, expected: number) => {
    if (actual !== expected)
      throw new ApiError(
        httpStatus.CONFLICT,
        "Cart was modified by another request. Reload your cart and try again.",
      );
  };

  const assertQuantity = (quantity: number) => {
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > CART_QUANTITY_STORAGE_MAX
    )
      throw new ApiError(
        httpStatus.UNPROCESSABLE_ENTITY,
        "Quantity must be a positive integer within the database storage range",
      );
  };

  const mutate = async (
    inputOwner: CartOwner | string,
    version: number,
    action: (
      tx: Prisma.TransactionClient,
      cart: MutationCart | null,
      owner: CartOwner,
    ) => Promise<string | null>,
  ) =>
    prisma.$transaction(async (tx) => {
      const owner = normalizeOwner(inputOwner);
      if (owner.kind === "user") await lockCustomer(tx, owner.userId);
      if (
        owner.kind === "guest" &&
        !(await lockGuest(tx, owner.cartId, owner.tokenHash))
      )
        throw new ApiError(
          httpStatus.CONFLICT,
          "Guest cart expired or changed. Reload your cart.",
        );
      // Load only IDs/quantities before mutation; hydrate catalogue data once afterward.
      const cart = await tx.cart.findFirst({
        where: ownerWhere(owner),
        select: mutationSelect,
      });
      assertVersion(cart?.version ?? 0, version);
      const cartId = await action(tx, cart, owner);
      return resultFor(
        tx,
        cartId
          ? await tx.cart.findUnique({
              where: { id: cartId },
              include: cartInclude,
            })
          : null,
      );
    });

  const addItem = (owner: CartOwner | string, input: AddCartItemInput) =>
    mutate(owner, input.version, async (tx, cart, resolvedOwner) => {
      const existing = cart?.items.find(
        (item) => item.variantId === input.variantId,
      );
      assertQuantity(input.quantity);
      const quantity = (existing?.quantity ?? 0) + input.quantity;
      assertQuantity(quantity);
      const variant = await tx.variant.findUnique({
        where: { id: input.variantId },
        select: variantAvailabilitySelect,
      });
      if (
        !variant ||
        getCartItemStatus(
          variant,
          quantity,
          await getPublicCategoryIds(tx),
          new Date(),
        ) === "UNAVAILABLE"
      )
        throw new ApiError(httpStatus.NOT_FOUND, "Variant is not available");
      if (quantity > variant.onHand - variant.reserved)
        throw new ApiError(
          httpStatus.CONFLICT,
          "Requested quantity exceeds available stock",
        );

      let cartId = cart?.id;
      if (!cartId) {
        let ownership: { customerId: string } | { guestTokenHash: string };
        if (resolvedOwner.kind === "user") {
          const customer = await tx.customer.upsert({
            where: { userId: resolvedOwner.userId },
            create: { userId: resolvedOwner.userId },
            update: {},
          });
          ownership = { customerId: customer.id };
        } else if (resolvedOwner.kind === "newGuest") {
          ownership = { guestTokenHash: resolvedOwner.tokenHash };
        } else
          throw new ApiError(
            httpStatus.CONFLICT,
            "Reload your cart before adding items",
          );
        const created = await tx.cart.create({
          data: ownership,
        });
        cartId = created.id;
      }
      if (existing)
        await tx.cartItem.update({
          where: { id: existing.id },
          data: { quantity },
        });
      else
        await tx.cartItem.create({
          data: { cartId, variantId: variant.id, quantity },
        });
      await tx.cart.update({
        where: { id: cartId },
        data: { version: { increment: 1 } },
      });
      return cartId;
    });

  const updateItem = (
    owner: CartOwner | string,
    itemId: string,
    input: UpdateCartItemInput,
  ) =>
    mutate(owner, input.version, async (tx, cart) => {
      const item = cart?.items.find((item) => item.id === itemId);
      if (!item)
        throw new ApiError(httpStatus.NOT_FOUND, "Cart item not found");
      assertQuantity(input.quantity);
      // Reductions remain possible after stock loss or catalogue deactivation.
      if (input.quantity > item.quantity) {
        const variant = await tx.variant.findUnique({
          where: { id: item.variantId },
          select: variantAvailabilitySelect,
        });
        if (!variant)
          throw new ApiError(httpStatus.NOT_FOUND, "Variant is not available");
        const status = getCartItemStatus(
          variant,
          input.quantity,
          await getPublicCategoryIds(tx),
          new Date(),
        );
        if (status === "UNAVAILABLE")
          throw new ApiError(httpStatus.NOT_FOUND, "Variant is not available");
        if (status !== "AVAILABLE")
          throw new ApiError(
            httpStatus.CONFLICT,
            "Requested quantity exceeds available stock",
          );
      }
      await tx.cartItem.update({
        where: { id: item.id },
        data: { quantity: input.quantity },
      });
      await tx.cart.update({
        where: { id: cart!.id },
        data: { version: { increment: 1 } },
      });
      return cart!.id;
    });

  const removeItem = (
    owner: CartOwner | string,
    itemId: string,
    version: number,
  ) =>
    mutate(owner, version, async (tx, cart) => {
      const item = cart?.items.find((item) => item.id === itemId);
      if (!item)
        throw new ApiError(httpStatus.NOT_FOUND, "Cart item not found");
      await tx.cartItem.delete({ where: { id: item.id } });
      await tx.cart.update({
        where: { id: cart!.id },
        data: { version: { increment: 1 } },
      });
      return cart!.id;
    });

  const clearCart = (owner: CartOwner | string, version: number) =>
    mutate(owner, version, async (tx, cart) => {
      if (!cart) return null;
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.update({
        where: { id: cart.id },
        data: { version: { increment: 1 } },
      });
      return cart.id;
    });

export const CartService = {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
};
