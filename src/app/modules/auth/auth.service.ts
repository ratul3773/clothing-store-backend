import ApiError from "../../../errors/ApiError";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { IAuthResponse, IRegisterUser } from "./auth.interface";
import httpStatus from "http-status";

const RegisterUser = async (payload: IRegisterUser): Promise<IAuthResponse> => {
    
    const existingUser = await prisma.user.findUnique({
        where: { email: payload.email },
    });
    if (existingUser) {
        throw new ApiError(httpStatus.CONFLICT, "Email already exists");
    }
    
    const data = await auth.api.signUpEmail({
        body: {
            name: payload.name, // required, The name of the user.
            email: payload.email, // required, The email address of the user.
            password: payload.password,
            role: Role.CUSTOMER,
            phone: payload.phone, // required, The password of the user.
        },
    });
    if(!data.user) {
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "User registration failed");
    }
    return {
        name: data.user.name,
        email: data.user.email,
    };
}

const verifyEmail = async (email: string, otp: string) => {
    const user = await prisma.user.findUnique({
        where: { email },
    });
    if (!user) {
        throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }
    await auth.api.verifyEmailOTP({
        body: {
            email: email, // required, Email address to send the OTP.
            otp: otp, // required, The OTP to verify.
        },
    });
};

const LoginUser = async (email: string, password: string): Promise<IAuthResponse> => {
    const result = await auth.api.signInEmail({
        body: {
            email: email, // required, The email address of the user.
            password: password, // required, The password of the user.
        },
    });
    if (!result.user) {
        throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid credentials");
    }
    return {
        name: result.user.name,
        email: result.user.email,
    };
};


export const AuthService = {
    RegisterUser,
    verifyEmail,
    LoginUser,
};

