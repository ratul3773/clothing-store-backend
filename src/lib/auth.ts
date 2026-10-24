import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "../lib/prisma"; // your prisma client instance
import { Role } from "../generated/prisma/enums";
import { emailOTP } from "better-auth/plugins";
import { sendMail } from "../utils/sendMail";
import { createAuthMiddleware, APIError } from "better-auth/api";

export const auth = betterAuth({
    trustedOrigins: ["http://localhost:3000"],
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
        onExistingUserSignUp:async ({ user }) => {
            if (user.emailVerified) {
                return;
            }
        },
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

      const email = String(ctx.body?.email ?? "").toLowerCase();
      const phone = String(ctx.body?.phone ?? "").toLowerCase();
      if (!email) return;
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
    }),
  },
    user:{
        additionalFields: {
            role: {
                type: "string",
                default: Role.customer,
            },
            phone: {
                type: "string",
                required: false,
                default: null,
            },
        }
    },
    plugins: [
        emailOTP({
             overrideDefaultEmailVerification: true,
             async sendVerificationOTP({email, otp,type}) {
            if(type === "email-verification") {
                const user = await prisma.user.findUnique({
                    where: { email },
                });
                if(user && !user.emailVerified) {
                    sendMail({
                        to: email,
                        subject: "Email Verification",
                        template: "otp-verification",
                        data:{
                            otp: otp,
                            expiryMinutes: 3,
                        }
                    });
                }
                if(user && user.emailVerified) {
                    return;
                }
            }
            },
            expiresIn: 3 * 60,
        })
    ]
});