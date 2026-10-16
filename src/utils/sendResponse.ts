import { Response } from "express";

type TResponse<T> = {
  statusCode: number;
  success: boolean;
  message?: string;
  data: T | null;
  token?: string;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPage: number;
  };
};

const sendResponse = <T>(res: Response, data: TResponse<T>) => {
  res.status(data?.statusCode).json({
    success: data?.success,
    message: data?.message,
    data: data?.data,
    token: data?.token,
    meta: {
      page: data?.meta?.page,
      limit: data?.meta?.limit,
      total: data?.meta?.total,
      totalPage: data?.meta?.totalPage,
    },
  });
};

export default sendResponse;
