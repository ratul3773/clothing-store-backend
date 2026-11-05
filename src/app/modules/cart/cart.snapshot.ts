import { Prisma } from "../../../generated/prisma/client";
import { cartInclude } from "./cart.select";
import { comboInclude } from "../combo/combo.select";

export const cartSnapshotItemInclude = {
  variant: {
    include: {
      ...cartInclude.items.include.variant.include,
    },
  },
} satisfies Prisma.CartItemInclude;

export const cartSnapshotComboInclude = {
  combo: {
    include: comboInclude,
  },
  selections: {
    include: {
      variant: {
        select: {
          size: true,
        },
      },
    },
  },
} satisfies Prisma.CartComboInclude;

export type SnapshotItem = Prisma.CartItemGetPayload<{
  include: typeof cartSnapshotItemInclude;
}>;

export type SnapshotCombo = Prisma.CartComboGetPayload<{
  include: typeof cartSnapshotComboInclude;
}>;

export type CartSnapshot = {
  items: SnapshotItem[];
  combos: SnapshotCombo[];
};

export const loadCartSnapshot = async (
  db: Prisma.TransactionClient,
  cartId: string,
): Promise<CartSnapshot> => {
  const [items, combos] = await Promise.all([
    db.cartItem.findMany({
      where: { cartId },
      include: cartSnapshotItemInclude,
      orderBy: [
        { createdAt: "asc" },
        { id: "asc" },
      ],
    }),

    db.cartCombo.findMany({
      where: { cartId },
      include: cartSnapshotComboInclude,
      orderBy: [
        { createdAt: "asc" },
        { id: "asc" },
      ],
    }),
  ]);

  return { items, combos };
};