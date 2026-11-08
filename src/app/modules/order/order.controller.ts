import type { Request, Response } from "express";
import ApiError from "../../../errors/ApiError";
import catchAsync from "../../../utils/catchAsync";
import pick from "../../../utils/pick";
import sendResponse from "../../../utils/sendResponse";
import { OrderService, type OrderAccess } from "./order.service";
import type { OrderListQuery } from "./order.validation";
import config from "../../../config/env";

const respond = (
  res: Response,
  data: unknown,
  message: string,
  statusCode = 200,
) => {
  res.setHeader("Cache-Control", "no-store");
  sendResponse(res, { statusCode, success: true, message, data });
};
const idempotencyKey = (req: Request) => {
  const key = req.get("Idempotency-Key");
  if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key))
    throw new ApiError(
      400,
      "Provide an Idempotency-Key of 16–128 letters, digits, underscores or hyphens",
    );
  return key;
};
const customerAccess = (req: Request): OrderAccess => ({
  kind: "customer",
  userId: req.user.id,
});
const adminAccess = (req: Request): OrderAccess => ({
  kind: "admin",
  userId: req.user.id,
});
const guestAccess = (req: Request): OrderAccess => {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(
    req.get("Authorization") ?? "",
  );
  if (!match) throw new ApiError(404, "Order not found");
  return { kind: "guest", token: match[1]! };
};

const checkout = (manual: boolean) =>
  catchAsync(async (req, res) => {
    const context = manual
      ? { adminId: req.user.id }
      : { owner: req.cartOwner! };
    const result = await OrderService.checkoutOrder(
      context,
      req.body,
      idempotencyKey(req),
    );
    respond(
      res,
      result,
      "Order placed",
      201,
    );
  });
const detail = (access: (req: Request) => OrderAccess) =>
  catchAsync(async (req, res) => {
    respond(
      res,
      await OrderService.getOrder(req.params.id as string, access(req)),
      "Order retrieved",
    );
  });
const list = (admin: boolean) =>
  catchAsync(async (req, res) => {
    const query = pick(req.validatedQuery as OrderListQuery, [
      "page",
      "limit",
      "status",
      "source",
      "q",
      "from",
      "to",
    ]);
    const result = await OrderService.listOrders(
      { kind: admin ? "admin" : "customer", userId: req.user.id },
      query,
    );
    res.setHeader("Cache-Control", "no-store");
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Orders retrieved",
      data: result.data,
      meta: result.meta,
    });
  });
const cancel = (access: (req: Request) => OrderAccess) =>
  catchAsync(async (req, res) => {
    respond(
      res,
      await OrderService.changeStatus(req.params.id as string, access(req), {
        ...req.body,
        status: "CANCELLED",
      }),
      "Order cancelled",
    );
  });

export const OrderController = {
  customerSearch: catchAsync(async (req, res) => {
    const { q } = req.validatedQuery as { q: string };
    respond(res, await OrderService.searchCustomers(q), "Customers retrieved");
  }),
  deliveryPolicy: catchAsync(async (_req, res) => {
    respond(res, config.orders.delivery, "Delivery policy");
  }),
  create: checkout(false),
  manualCreate: checkout(true),
  detail: detail(customerAccess),
  guestDetail: detail(guestAccess),
  adminDetail: detail(adminAccess),
  list: list(false),
  adminList: list(true),
  cancel: cancel(customerAccess),
  guestCancel: cancel(guestAccess),
  transition: catchAsync(async (req, res) => {
    respond(
      res,
      await OrderService.changeStatus(
        req.params.id as string,
        adminAccess(req),
        req.body,
      ),
      "Order updated",
    );
  }),
  returnReceipt: catchAsync(async (req, res) => {
    respond(
      res,
      await OrderService.changeStatus(
        req.params.id as string,
        adminAccess(req),
        { ...req.body, status: "RETURNED" },
      ),
      "Returned goods recorded",
    );
  }),
};
