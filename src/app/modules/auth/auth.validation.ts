import { z } from "zod";

const bdPhoneRegex = /^(?:\+8801[3-9]\d{8}|01[3-9]\d{8})$/;

const registerUserSchema = z.object({
  body: z
    .object({
      name: z
        .string({ error: "Name is required" })
        .trim()
        .min(1, "Name is required")
        .max(200),
      email: z
        .string({ error: "Email is required" })
        .trim()
        .toLowerCase()
        .email("Invalid email"),
      password: z
        .string({ error: "Password is required" })
        .min(12, "Password must be at least 12 characters")
        .max(128),
      phone: z
        .string({ error: "Phone is required" })
        .regex(bdPhoneRegex, "Enter a valid Bangladeshi phone number"),
    })
    .strict(),
});

const updateUserSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(1).max(200).optional(),
      email: z.string().trim().toLowerCase().email().optional(),
      password: z.string().min(12).max(128).optional(),
      phone: z
        .string()
        .regex(bdPhoneRegex, "Enter a valid Bangladeshi phone number")
        .optional(),
      profilePicture: z.string().url("Invalid URL").optional(),
    })
    .strict(),
});

const loginValidationSchema = z.object({
  body: z
    .object({
      email: z
        .string({ error: "Email is required" })
        .trim()
        .toLowerCase()
        .email("Invalid email"),
      password: z.string({ error: "Password is required" }).min(1),
    })
    .strict(),
});

const verifyEmailValidationSchema = z.object({
  body: z
    .object({
      email: z
        .string({ error: "Email is required" })
        .trim()
        .toLowerCase()
        .email("Invalid email"),
      otp: z
        .string({ error: "OTP is required" })
        .min(6, "OTP must be 6 digits")
        .max(6, "OTP must be 6 digits"),
    })
    .strict(),
});

const changePasswordValidationSchema = z.object({
  body: z
    .object({
      oldPassword: z.string({
        error: "Old password is required",
      }),
      newPassword: z
        .string({ error: "Password is required" })
        .min(12)
        .max(128),
    })
    .strict(),
});

export const AuthValidation = {
  registerUserSchema,
  updateUserSchema,
  loginValidationSchema,
  verifyEmailValidationSchema,
  changePasswordValidationSchema,
};
