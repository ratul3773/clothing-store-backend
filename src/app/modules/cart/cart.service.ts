import httpStatus from "http-status";
import { Prisma, PrismaClient } from "../../../generated/prisma/client";
import ApiError from "../../../errors/ApiError";
import { prisma } from "../../../lib/prisma";
import { getPublicCategoryIds } from "../product/catalog.rules";
import { CART_MAX_ITEMS, CART_MAX_QUANTITY } from "./cart.constants";
import { AddCartItemInput, UpdateCartItemInput } from "./cart.interface";
import { getCartItemStatus, mapCart } from "./cart.mapper";
import { cartInclude, CartWithItems } from "./cart.select";

const readCart = async (tx: Prisma.TransactionClient, userId: string) =>
  tx.cart.findFirst({
    where: { customer: { userId, deletedAt: null, anonymizedAt: null } },
    include: cartInclude,
  });

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
export const createCartService = (db: PrismaClient) => {
  const getCart = (userId: string) =>
    db.$transaction(async (tx) => resultFor(tx, await readCart(tx, userId)), {
      isolationLevel: "RepeatableRead",
    });

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
      quantity > CART_MAX_QUANTITY
    )
      throw new ApiError(
        httpStatus.UNPROCESSABLE_ENTITY,
        `A cart item must contain between 1 and ${CART_MAX_QUANTITY} units`,
      );
  };

  const mutate = async (
    userId: string,
    version: number,
    action: (
      tx: Prisma.TransactionClient,
      cart: CartWithItems | null,
    ) => Promise<void>,
  ) =>
    db.$transaction(async (tx) => {
      // Lock a stable existing row, including for two simultaneous first-cart writes.
      // Every cart writer must follow this protocol (including future checkout).
      const users = await tx.$queryRaw<
        Array<{
          id: string;
          isDeleted: boolean;
          deletedAt: Date | null;
          emailVerified: boolean;
        }>
      >`
    SELECT id, "isDeleted", "deletedAt", "emailVerified" FROM "user"
    WHERE id = ${userId} FOR UPDATE
  `;
      const user = users[0];
      if (!user || user.isDeleted || user.deletedAt || !user.emailVerified)
        throw new ApiError(
          httpStatus.UNAUTHORIZED,
          "Please sign in to continue",
        );
      const customer = await tx.customer.findUnique({ where: { userId } });
      if (customer?.deletedAt || customer?.anonymizedAt)
        throw new ApiError(
          httpStatus.FORBIDDEN,
          "Your customer profile is no longer active",
        );
      const cart = await readCart(tx, userId);
      assertVersion(cart?.version ?? 0, version);
      await action(tx, cart);
      return resultFor(tx, await readCart(tx, userId));
    });

  const addItem = (userId: string, input: AddCartItemInput) =>
    mutate(userId, input.version, async (tx, cart) => {
      const existing = cart?.items.find(
        (item) => item.variantId === input.variantId,
      );
      assertQuantity(input.quantity);
      const quantity = (existing?.quantity ?? 0) + input.quantity;
      assertQuantity(quantity);
      if (!existing && (cart?.items.length ?? 0) >= CART_MAX_ITEMS)
        throw new ApiError(
          httpStatus.CONFLICT,
          `A cart can contain at most ${CART_MAX_ITEMS} distinct variants`,
        );

      const variant = await tx.variant.findUnique({
        where: { id: input.variantId },
        include: cartInclude.items.include.variant.include,
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
        // Legacy/admin-created users may not yet have a customer profile.
        const customer = await tx.customer.upsert({
          where: { userId },
          create: { userId },
          update: {},
        });
        const created = await tx.cart.create({
          data: { customerId: customer.id },
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
    });

  const updateItem = (
    userId: string,
    itemId: string,
    input: UpdateCartItemInput,
  ) =>
    mutate(userId, input.version, async (tx, cart) => {
      const item = cart?.items.find((item) => item.id === itemId);
      if (!item)
        throw new ApiError(httpStatus.NOT_FOUND, "Cart item not found");
      assertQuantity(input.quantity);
      // Reductions remain possible after stock loss or catalogue deactivation.
      if (input.quantity > item.quantity) {
        const status = getCartItemStatus(
          item.variant,
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
        where: { id: item.cartId },
        data: { version: { increment: 1 } },
      });
    });

  const removeItem = (userId: string, itemId: string, version: number) =>
    mutate(userId, version, async (tx, cart) => {
      const item = cart?.items.find((item) => item.id === itemId);
      if (!item)
        throw new ApiError(httpStatus.NOT_FOUND, "Cart item not found");
      await tx.cartItem.delete({ where: { id: item.id } });
      await tx.cart.update({
        where: { id: item.cartId },
        data: { version: { increment: 1 } },
      });
    });

  const clearCart = (userId: string, version: number) =>
    mutate(userId, version, async (tx, cart) => {
      if (!cart) return;
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.update({
        where: { id: cart.id },
        data: { version: { increment: 1 } },
      });
    });

  return { getCart, addItem, updateItem, removeItem, clearCart };
};

export const CartService = createCartService(prisma);
