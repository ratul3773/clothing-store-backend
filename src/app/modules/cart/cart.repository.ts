import httpStatus from "http-status";
import { Prisma } from "../../../generated/prisma/client";
import ApiError from "../../../errors/ApiError";
import { GUEST_CART_TTL_MS } from "./cart.constants";
import { CartOwner } from "./cart.interface";
import { cartInclude } from "./cart.select";

export const guestCutoff = (now = new Date()) =>
  new Date(now.getTime() - GUEST_CART_TTL_MS);
export const normalizeOwner = (owner: CartOwner | string): CartOwner =>
  typeof owner === "string" ? { kind: "user", userId: owner } : owner;

export const ownerWhere = (
  owner: CartOwner,
  now = new Date(),
): Prisma.CartWhereInput => {
  if (owner.kind === "user")
    return {
      customer: {
        userId: owner.userId,
        deletedAt: null,
        anonymizedAt: null,
        user: {
          isDeleted: false,
          deletedAt: null,
          emailVerified: true,
          role: "customer",
        },
      },
    };
  if (owner.kind === "guest")
    return {
      id: owner.cartId,
      guestTokenHash: owner.tokenHash,
      customerId: null,
      updatedAt: { gt: guestCutoff(now) },
    };
  return { id: { in: [] } };
};

export const readCart = (tx: Prisma.TransactionClient, owner: CartOwner) =>
  tx.cart.findFirst({ where: ownerWhere(owner), include: cartInclude });

export const lockCustomer = async (
  tx: Prisma.TransactionClient,
  userId: string,
) => {
  const users = await tx.$queryRaw<
    Array<{
      id: string;
      isDeleted: boolean;
      deletedAt: Date | null;
      emailVerified: boolean;
      role: string;
    }>
  >`
    SELECT id, "isDeleted", "deletedAt", "emailVerified", role FROM "user" WHERE id = ${userId} FOR UPDATE
  `;
  const user = users[0];
  if (!user || user.isDeleted || user.deletedAt || !user.emailVerified)
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      "Your account is no longer active or verified",
    );
  if (user.role !== "customer")
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only customer accounts can use carts",
    );
  const customer = await tx.customer.findUnique({ where: { userId } });
  if (customer?.deletedAt || customer?.anonymizedAt)
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Your customer profile is no longer active",
    );
  return customer;
};

// Guest mutations, merging, and cleanup all coordinate on the guest cart row.
// A consumed/expired token must never recreate a guest cart after login.
export const lockGuest = async (
  tx: Prisma.TransactionClient,
  cartId: string,
  tokenHash: string,
) => {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM carts WHERE id = ${cartId} AND "guestTokenHash" = ${tokenHash}
      AND "customerId" IS NULL AND "updatedAt" > ${guestCutoff()} FOR UPDATE
  `;
  return rows[0]?.id ?? null;
};
