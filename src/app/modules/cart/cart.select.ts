import { Prisma } from "../../../generated/prisma/client";

export const cartInclude = {
  items: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      variant: {
        include: {
          color: { select: { name: true } },
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              publishedAt: true,
              categoryId: true,
              regularPrice: true,
              offers: {
                select: {
                  offerPrice: true,
                  startsAt: true,
                  endsAt: true,
                  isActive: true,
                },
              },
              images: {
                select: {
                  colorId: true,
                  storageKey: true,
                  provider: true,
                  isPrimary: true,
                },
                orderBy: [
                  { isPrimary: "desc" },
                  { sortOrder: "asc" },
                  { id: "asc" },
                ],
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

export type CartWithItems = Prisma.CartGetPayload<{
  include: typeof cartInclude;
}>;
export type CartLine = CartWithItems["items"][number];
