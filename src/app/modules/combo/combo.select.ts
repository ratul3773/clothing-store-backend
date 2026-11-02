import { Prisma } from "../../../generated/prisma/client";
import { cartInclude, variantAvailabilitySelect } from "../cart/cart.select";

export const comboAvailabilitySelect = {
  id: true, price: true, isActive: true, startsAt: true, endsAt: true,
  items: {
    orderBy: { id: "asc" },
    select: { variantId: true, quantity: true, variant: { select: variantAvailabilitySelect } },
  },
} satisfies Prisma.ComboSelect;

export const comboInclude = {
  items: {
    orderBy: { id: "asc" },
    include: { variant: cartInclude.items.include.variant },
  },
} satisfies Prisma.ComboInclude;

export type ComboAvailability = Prisma.ComboGetPayload<{ select: typeof comboAvailabilitySelect }>;
export type ComboWithItems = Prisma.ComboGetPayload<{ include: typeof comboInclude }>;
