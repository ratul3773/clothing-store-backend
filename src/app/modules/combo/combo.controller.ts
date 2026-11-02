import { Request, Response } from "express";
import catchAsync from "../../../utils/catchAsync";
import sendResponse from "../../../utils/sendResponse";
import pick from "../../../utils/pick";
import type { PaginationQuery } from "../../../utils/pagination";
import { ComboService } from "./combo.service";

const list = (admin: boolean) => catchAsync(async (req: Request, res: Response) => {
  const result = await ComboService.list(pick(req.validatedQuery as PaginationQuery, ["page", "limit"]), admin);
  sendResponse(res, { statusCode: 200, success: true, message: "Combos retrieved", data: result.data, meta: result.meta });
});
const detail = (admin: boolean) => catchAsync(async (req: Request, res: Response) => {
  const data = await ComboService.detail((admin ? req.params.id : req.params.slug) as string, admin);
  sendResponse(res, { statusCode: 200, success: true, message: "Combo retrieved", data });
});
export const ComboController = {
  list: list(false), adminList: list(true), detail: detail(false), adminDetail: detail(true),
  create: catchAsync(async (req: Request, res: Response) => {
    const data = await ComboService.create(req.body);
    sendResponse(res, { statusCode: 201, success: true, message: "Combo created", data });
  }),
  update: catchAsync(async (req: Request, res: Response) => {
    const data = await ComboService.update(req.params.id as string, req.body);
    sendResponse(res, { statusCode: 200, success: true, message: "Combo updated", data });
  }),
};
