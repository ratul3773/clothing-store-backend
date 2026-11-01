import { RequestHandler } from "express";
import { fromNodeHeaders } from "better-auth/node";
import httpStatus from "http-status";
import { auth } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import ApiError from "../../../errors/ApiError";
import { CART_COOKIE_NAME } from "./cart.constants";
import { clearCartCookie, hashCartToken, isCartToken } from "./cart.cookie";
import { guestCutoff } from "./cart.repository";

export const resolveCart: RequestHandler = async (req, res, next) => {
  try {
    // Validate the session against storage, not a potentially revoked cookie cache.
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
      query: { disableCookieCache: true },
    });
    if (session) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          emailVerified: true,
          isDeleted: true,
          deletedAt: true,
        },
      });
      // Never downgrade a known deleted/unverified/forbidden account to a guest.
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
      const customer = await prisma.customer.findUnique({
        where: { userId: user.id },
        select: { deletedAt: true, anonymizedAt: true },
      });
      if (customer?.deletedAt || customer?.anonymizedAt)
        throw new ApiError(
          httpStatus.FORBIDDEN,
          "Your customer profile is no longer active",
        );
      req.user = user;
      req.cartOwner = { kind: "user", userId: user.id };
    } else {
      req.cartOwner = { kind: "none" };
      const token: unknown = req.cookies?.[CART_COOKIE_NAME];
      if (isCartToken(token)) {
        const tokenHash = hashCartToken(token);
        const cart = await prisma.cart.findUnique({
          where: { guestTokenHash: tokenHash },
          select: {
            id: true,
            customerId: true,
            updatedAt: true,
          },
        });
        if (cart && cart.customerId === null && cart.updatedAt > guestCutoff())
          req.cartOwner = { kind: "guest", cartId: cart.id, tokenHash };
        else clearCartCookie(res);
      } else if (token !== undefined) clearCartCookie(res);
    }
    next();
  } catch (error) {
    next(error);
  }
};
