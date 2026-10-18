import { z } from "zod";

const bdPhoneRegex = /^(?:\+8801[3-9]\d{8}|01[3-9]\d{8})$/;

const registerUserSchema = z.object({
  body: z.object({
    name: z.string({ error: "Name is required" }).min(1, "Name is required"),
    email: z.string({ error: "Email is required" }).email("Invalid email"),
    password: z.string({ error: "Password is required" }).min(8, "Password must be at least 8 characters"),
    phone: z.string({ error: "Phone is required" }).regex(bdPhoneRegex, "Enter a valid Bangladeshi phone number"),
    role: z
      .enum([
        "customer",
        "admin",
      ])
      .optional(),
  }),
});

// update validation
const updateUserSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
    phone: z.string().regex(bdPhoneRegex, "Enter a valid Bangladeshi phone number").optional(),
    profilePicture: z.string().url("Invalid URL").optional(),
    role: z
      .enum([
        "customer",
        "admin",
      ])
      .optional(),
  }),
});

const loginValidationSchema = z.object({
  body: z.object({
    email: z.string({error : "Email is required"}).email("Invalid email"),
    password: z.string({ error: "Password is required" }),
  }),
});

const verifyEmailValidationSchema = z.object({
  body: z.object({
    email: z.string({ error: "Email is required" }).email("Invalid email"),
    otp: z.string({ error: "OTP is required" }).min(6, "OTP must be 6 digits").max(6, "OTP must be 6 digits"),
  }),
});

const changePasswordValidationSchema = z.object({
  body: z.object({
    oldPassword: z.string({
      error: "Old password is required",
    }),
    newPassword: z.string({ error: "Password is required" }),
  }),
});

export const AuthValidation = {
  registerUserSchema,
  updateUserSchema,
  loginValidationSchema,
  verifyEmailValidationSchema,
  changePasswordValidationSchema,
};
