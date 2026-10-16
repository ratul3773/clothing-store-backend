import { Request, Response } from "express";
import catchAsync from "../../../utils/catchAsync";
import sendResponse from "../../../utils/sendResponse";
import { AuthService } from "./auth.service";
import httpStatus from "http-status";

const RegisterUser = catchAsync(
    async (req: Request, res: Response) => {
        const payload = req.body;
        const result = await AuthService.RegisterUser(payload);
        sendResponse(res, {
            statusCode: httpStatus.CREATED,
            success: true,
            message: "User registered successfully",
            data: result,
        }
        );
    });

const verifyEmail = catchAsync(
    async (req: Request, res: Response) => {
        const { email, otp } = req.body;
        await AuthService.verifyEmail(email, otp);
        sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: "Email verified successfully",
            data: null,
        });
    });
const LoginUser = catchAsync(
    async (req: Request, res: Response) => {
        const { email, password } = req.body;
        const result = await AuthService.LoginUser(email, password);
        sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: "User logged in successfully",
            data: result,
        });
    });
export const AuthController = {
    RegisterUser,
    verifyEmail,
    LoginUser,
};