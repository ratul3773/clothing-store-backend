import ApiError from "../../../errors/ApiError";
import { auth } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { normalizeBdPhone } from "../../../utils/phone";
import { AuthResult, IRegisterUser } from "./auth.interface";
import httpStatus from "http-status";
import { cartMergeFromResponse } from "../cart/cart.auth";

const RegisterUser = async (
  payload: IRegisterUser,
  headers = new Headers(),
): Promise<AuthResult> => {
  const email = payload.email.trim().toLowerCase();
  const phone = normalizeBdPhone(payload.phone);

  if (!phone) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "A valid Bangladeshi phone number is required",
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });
  if (existingUser) {
    throw new ApiError(httpStatus.CONFLICT, "Email already exists");
  }

  const existingPhone = await prisma.user.findUnique({
    where: { phone },
  });
  if (existingPhone) {
    throw new ApiError(httpStatus.CONFLICT, "Phone number already exists");
  }

  const result = await auth.api.signUpEmail({
    headers,
    body: {
      name: payload.name,
      email,
      password: payload.password,
      phone,
    },
    returnHeaders: true,
  });

  if (!result.response?.user) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "User registration failed",
    );
  }

  return {
    data: {
      name: result.response.user.name,
      email: result.response.user.email,
    },
    headers: result.headers,
    cartMerge: cartMergeFromResponse(result.response),
  };
};

const verifyEmail = async (
  email: string,
  otp: string,
  headers = new Headers(),
) => {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  const result = await auth.api.verifyEmailOTP({
    headers,
    body: {
      email: user.email,
      otp,
    },
    returnHeaders: true,
  });

  return {
    headers: result.headers,
    cartMerge: cartMergeFromResponse(result.response),
  };
};

const LoginUser = async (
  email: string,
  password: string,
  headers = new Headers(),
): Promise<AuthResult> => {
  const result = await auth.api.signInEmail({
    headers,
    body: {
      email: email.trim().toLowerCase(),
      password,
    },
    returnHeaders: true,
  });

  if (!result.response?.user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid credentials");
  }

  return {
    data: {
      name: result.response.user.name,
      email: result.response.user.email,
    },
    headers: result.headers,
    cartMerge: cartMergeFromResponse(result.response),
  };
};

export const AuthService = {
  RegisterUser,
  verifyEmail,
  LoginUser,
};
