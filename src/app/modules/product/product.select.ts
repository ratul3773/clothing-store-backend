import { Prisma } from "../../../generated/prisma/client";

export const productRelationsInclude = {
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      parentId: true,
    },
  },
  colors: {
    select: {
      id: true,
      name: true,
      hex: true,
      sortOrder: true,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  },
  variants: {
    orderBy: [{ sizeOrder: "asc" }, { size: "asc" }],
  },
  images: {
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  },
  offers: {
    orderBy: { startsAt: "asc" },
  },
  createdBy: {
    select: { id: true, name: true, email: true },
  },
  updatedBy: {
    select: { id: true, name: true, email: true },
  },
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{
  include: typeof productRelationsInclude;
}>;
