import { Request, Response } from "express";
import catchAsync from "../../../utils/catchAsync";
import sendResponse from "../../../utils/sendResponse";
import {
  AddCartItemInput,
  CartDto,
  CartVersionQuery,
  UpdateCartItemInput,
} from "./cart.interface";
import { CartService } from "./cart.service";

const respond = (res: Response, data: CartDto, message: string) =>
  sendResponse(res, { statusCode: 200, success: true, message, data });

export const CartController = {
  getCart: catchAsync(async (req: Request, res: Response) => {
    respond(
      res,
      await CartService.getCart(req.user.id),
      "Cart retrieved successfully",
    );
  }),
  addItem: catchAsync(async (req: Request, res: Response) => {
    respond(
      res,
      await CartService.addItem(req.user.id, req.body as AddCartItemInput),
      "Item added to cart",
    );
  }),
  updateItem: catchAsync(async (req: Request, res: Response) => {
    respond(
      res,
      await CartService.updateItem(
        req.user.id,
        req.params.itemId as string,
        req.body as UpdateCartItemInput,
      ),
      "Cart item updated",
    );
  }),
  removeItem: catchAsync(async (req: Request, res: Response) => {
    respond(
      res,
      await CartService.removeItem(
        req.user.id,
        req.params.itemId as string,
        (req.validatedQuery as CartVersionQuery).version,
      ),
      "Cart item removed",
    );
  }),
  clearCart: catchAsync(async (req: Request, res: Response) => {
    respond(
      res,
      await CartService.clearCart(
        req.user.id,
        (req.validatedQuery as CartVersionQuery).version,
      ),
      "Cart cleared",
    );
  }),
};
