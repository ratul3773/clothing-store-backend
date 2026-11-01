import { createHash, randomBytes } from "node:crypto";
import { Response } from "express";
import config from "../../../config/env";
import { CART_COOKIE_NAME, GUEST_CART_TTL_MS } from "./cart.constants";

export const cartCookieAttributes = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: config.env === "production",
  path: "/",
};

export const isCartToken = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);

export const hashCartToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const createCartToken = () => randomBytes(32).toString("base64url");
export const setCartCookie = (res: Response, token: string) =>
  res.cookie(CART_COOKIE_NAME, token, {
    ...cartCookieAttributes,
    maxAge: GUEST_CART_TTL_MS,
  });
export const clearCartCookie = (res: Response) =>
  res.clearCookie(CART_COOKIE_NAME, cartCookieAttributes);
