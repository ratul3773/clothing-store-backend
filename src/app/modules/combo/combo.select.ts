import { Prisma } from "../../../generated/prisma/client";
import { cartInclude, variantAvailabilitySelect } from "../cart/cart.select";

const sizeAvailabilitySelect = {
  id: true, productId: true, colorId: true, isActive: true, onHand: true, reserved: true,
} satisfies Prisma.VariantSelect;

export const comboAvailabilitySelect = {
  id: true, price: true, isActive: true, startsAt: true, endsAt: true,
  items: {
    orderBy: { id: "asc" },
    select: { id: true, colorId: true, quantity: true, color: { select: {
      product: { select: { id: true, ...variantAvailabilitySelect.product.select } },
      variants: { select: sizeAvailabilitySelect },
    } } },
  },
} satisfies Prisma.ComboSelect;

export const comboColorSelect = {
  id: true, name: true, hex: true,
  product: { select: cartInclude.items.include.variant.include.product.select },
  variants: {
    orderBy: [{ sizeOrder: "asc" }, { size: "asc" }, { id: "asc" }],
    select: { ...sizeAvailabilitySelect, size: true, sizeOrder: true, lowStockThreshold: true },
  },
} satisfies Prisma.ProductColorSelect;

export const comboInclude = {
  items: { orderBy: { id: "asc" }, include: { color: { select: comboColorSelect } } },
} satisfies Prisma.ComboInclude;

export type ComboAvailability = Prisma.ComboGetPayload<{ select: typeof comboAvailabilitySelect }>;
export type ComboWithItems = Prisma.ComboGetPayload<{ include: typeof comboInclude }>;
