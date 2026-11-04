import { Prisma } from "../../../generated/prisma/client";

export const variantAvailabilitySelect = {
  id: true,
  onHand: true,
  reserved: true,
  isActive: true,
  product: { select: { status: true, publishedAt: true, categoryId: true } },
} satisfies Prisma.VariantSelect;

export type CartAvailabilityVariant = Prisma.VariantGetPayload<{
  select: typeof variantAvailabilitySelect;
}>;

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

// Totals and cross-page selection need availability/prices, but no product
// names, images, colours, or other display data from off-page items.
export const cartSummarySelect = {
  id: true,
  createdAt: true,
  quantity: true,
  variant: {
    select: {
      ...variantAvailabilitySelect,
      product: {
        select: {
          ...variantAvailabilitySelect.product.select,
          regularPrice: true,
          offers: cartInclude.items.include.variant.include.product.select.offers,
        },
      },
    },
  },
} satisfies Prisma.CartItemSelect;

export type CartSummaryLine = Prisma.CartItemGetPayload<{ select: typeof cartSummarySelect }>;
