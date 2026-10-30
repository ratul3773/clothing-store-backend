import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "../lib/prisma"; // your prisma client instance
import { Role } from "../generated/prisma/enums";
import { emailOTP } from "better-auth/plugins";
import { sendMail } from "../utils/sendMail";
import { createAuthMiddleware, APIError } from "better-auth/api";
import config from "../config/env";
import { normalizeBdPhone } from "../utils/phone";

export const auth = betterAuth({
  secret: config.better_auth.secret,
  baseURL: config.better_auth.url,
  trustedOrigins: [config.frontend_url, config.better_auth.url],
  advanced: {
    useSecureCookies: config.env === "production",
  },
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: {
      "/email-otp/send-verification-otp": {
        window: 180,
        max: 1,
      },
      "/sign-in/email": {
        window: 15,
        max: 3,
      },
      "/sign-up/email": {
        window: 15,
        max: 3,
      },
    },
  },
  session: {
    expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
    updateAge: 24 * 60 * 60, // 24 hours in seconds
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
      strategy: "jwt",
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await prisma.customer.create({ data: { userId: user.id } });
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;

      const body = ctx.body as Record<string, unknown> | undefined;
      const email = String(body?.email ?? "")
        .trim()
        .toLowerCase();
      const phone = normalizeBdPhone(body?.phone ?? body?.phoneNumber);

      if (!email) {
        throw new APIError("BAD_REQUEST", {
          message: "Email is required",
          code: "EMAIL_REQUIRED",
        });
      }

      if (!phone) {
        throw new APIError("BAD_REQUEST", {
          message: "A valid Bangladeshi phone number is required",
          code: "PHONE_REQUIRED",
        });
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        throw new APIError("BAD_REQUEST", {
          message: "An account with this email already exists",
          code: "USER_ALREADY_EXISTS",
        });
      }
      const existingPhone = await prisma.user.findUnique({ where: { phone } });
      if (existingPhone) {
        throw new APIError("BAD_REQUEST", {
          message: "An account with this phone number already exists",
          code: "USER_ALREADY_EXISTS",
        });
      }
      if (body) {
        body.email = email;
        body.phone = phone;
        delete body.role;
      }
    }),
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: Role.customer,
        input: false,
      },
      phone: {
        type: "string",
        required: false,
        defaultValue: null,
      },
    },
  },
  plugins: [
    emailOTP({
      overrideDefaultEmailVerification: true,
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "email-verification") return;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || user.emailVerified) return;

        await sendMail({
          to: email,
          subject: "Email Verification",
          template: "otp-verification",
          data: {
            otp,
            expiryMinutes: 3,
          },
        });
      },
      expiresIn: 3 * 60,
    }),
  ],
});
