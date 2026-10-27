import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { Role } from "../generated/prisma/enums";
import { prisma } from "../lib/prisma";
import { normalizeBdPhone } from "../utils/phone";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME?.trim() || "Store Admin";
const phoneInput = process.env.ADMIN_PHONE?.trim();
const phone = phoneInput ? normalizeBdPhone(phoneInput) : null;


if (!email) {
  throw new Error("ADMIN_EMAIL is required");
}

if (!password || password.length < 12) {
  throw new Error("ADMIN_PASSWORD must be at least 12 characters");
}

if (phoneInput && !phone) {
  throw new Error("ADMIN_PHONE must be a valid Bangladesh phone number");
}

const run = async () => {
  const existing = await prisma.user.findUnique({ where: { email } });
  const passwordHash = await hashPassword(password);

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        name,
        role: Role.admin,
        emailVerified: true,
        isDeleted: false,
        deletedAt: null,
        ...(phone ? { phone } : {}),
      },
    });

    const account = await prisma.account.findFirst({
      where: { userId: existing.id, providerId: "credential" },
      select: { id: true },
    });

    if (account) {
      await prisma.account.update({
        where: { id: account.id },
        data: { password: passwordHash },
      });
    } else {
      await prisma.account.create({
        data: {
          id: randomUUID(),
          accountId: existing.id,
          providerId: "credential",
          userId: existing.id,
          password: passwordHash,
        },
      });
    }

    console.log(`Admin account updated: ${email}`);
    return;
  }

  const userId = randomUUID();

  await prisma.$transaction([
    prisma.user.create({
      data: {
        id: userId,
        name,
        email,
        phone,
        role: Role.admin,
        emailVerified: true,
      },
    }),
    prisma.account.create({
      data: {
        id: randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: passwordHash,
      },
    }),
  ]);

  console.log(`Admin account created: ${email}`);
};

run()
  .catch((error) => {
    console.error("Admin bootstrap failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
