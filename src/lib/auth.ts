import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "../lib/prisma"; // your prisma client instance
import { Role } from "../generated/prisma/enums";
import { emailOTP } from "better-auth/plugins";
import { sendMail } from "../utils/sendMail";

export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
        onExistingUserSignUp: async ({ user }, request) => {
      sendMail({
        to: user.email,
        subject: "Sign-up attempt with your email",
        template: "existing-user-signup",
        data: {
          name: user.name,
          email: user.email,
        },
      });
    },
    },
    emailVerification: {
        sendOnSignUp: true,
        sendOnSignIn: true,
        autoSignInAfterVerification: true,
    },
    user:{
        additionalFields: {
            role: {
                type: "string",
                default: Role.CUSTOMER,
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
            }
            },
            expiresIn: 3 * 60,
        })
    ]
});