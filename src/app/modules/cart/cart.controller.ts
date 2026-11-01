import { Request, Response } from "express";
import catchAsync from "../../../utils/catchAsync";
import sendResponse from "../../../utils/sendResponse";
import ApiError from "../../../errors/ApiError";
import pick from "../../../utils/pick";
import { CART_COOKIE_NAME } from "./cart.constants";
import {
  createCartToken,
  hashCartToken,
  isCartToken,
  setCartCookie,
} from "./cart.cookie";
import {
  AddCartItemInput,
  CartDto,
  CartPageQuery,
  CartVersionQuery,
  UpdateCartItemInput,
} from "./cart.interface";
import { CartService } from "./cart.service";

const respond = (res: Response, data: CartDto, message: string) =>
  sendResponse(res, { statusCode: 200, success: true, message, data });

const ownerFor = (req: Request) => {
  if (!req.cartOwner) throw new ApiError(500, "Cart owner was not resolved");
  return req.cartOwner;
};
const renewGuestCookie = (req: Request, res: Response) => {
  const token: unknown = req.cookies?.[CART_COOKIE_NAME];
  if (req.cartOwner?.kind === "guest" && isCartToken(token))
    setCartCookie(res, token);
};
const getCart = catchAsync(async (req: Request, res: Response) => {
  const query = pick(req.validatedQuery as Partial<CartPageQuery>, ["page", "limit"]);
  const pagination = query.page !== undefined || query.limit !== undefined
    ? { page: query.page ?? 1, limit: query.limit ?? 5 }
    : undefined;
  respond(
    res,
    await (pagination ? CartService.getCart(ownerFor(req), pagination) : CartService.getCart(ownerFor(req))),
    "Cart retrieved successfully",
  );
})
const addItem = catchAsync(async (req: Request, res: Response) => {
  const owner = ownerFor(req);
  const token = owner.kind === "none" ? createCartToken() : null;
  const data = await CartService.addItem(
    token ? { kind: "newGuest", tokenHash: hashCartToken(token) } : owner,
    req.body as AddCartItemInput,
  );
  if (token) setCartCookie(res, token);
  else renewGuestCookie(req, res);
  respond(res, data, "Item added to cart");
})
const updateItem = catchAsync(async (req: Request, res: Response) => {
  const data = await CartService.updateItem(
    ownerFor(req),
    req.params.itemId as string,
    req.body as UpdateCartItemInput,
  );
  renewGuestCookie(req, res);
  respond(res, data, "Cart item updated");
})
const removeItem = catchAsync(async (req: Request, res: Response) => {
  const data = await CartService.removeItem(
    ownerFor(req),
    req.params.itemId as string,
    (req.validatedQuery as CartVersionQuery).version,
  );
  renewGuestCookie(req, res);
  respond(res, data, "Cart item removed");
})
const clearCart = catchAsync(async (req: Request, res: Response) => {
  const data = await CartService.clearCart(
    ownerFor(req),
    (req.validatedQuery as CartVersionQuery).version,
  );
  renewGuestCookie(req, res);
  respond(res, data, "Cart cleared");
})

export const CartController = {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
};
