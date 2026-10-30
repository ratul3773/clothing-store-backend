import { Request, Response } from "express";
import catchAsync from "../../../utils/catchAsync";
import sendResponse from "../../../utils/sendResponse";
import { AuthService } from "./auth.service";
import httpStatus from "http-status";

const forwardAuthHeaders = (res: Response, headers: Headers) => {
  const setCookies = headers.getSetCookie();

  if (setCookies.length > 0) {
    res.setHeader("Set-Cookie", setCookies);
  }
};

const RegisterUser = catchAsync(
  async (req: Request, res: Response) => {
    const payload = req.body;
    const result = await AuthService.RegisterUser(payload);
    forwardAuthHeaders(res, result.headers);
    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "User registered successfully",
      data: result.data,
    });
  },
);

const verifyEmail = catchAsync(async (req: Request, res: Response) => {
  const { email, otp } = req.body;
  const headers = await AuthService.verifyEmail(email, otp);
  forwardAuthHeaders(res, headers);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Email verified successfully",
    data: null,
  });
});

const LoginUser = catchAsync(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const result = await AuthService.LoginUser(email, password);
  forwardAuthHeaders(res, result.headers);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User logged in successfully",
    data: result.data,
  });
});

export const AuthController = {
  RegisterUser,
  verifyEmail,
  LoginUser,
};
