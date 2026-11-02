import { Prisma, PrismaClient } from "../../../generated/prisma/client";
import { prisma } from "../../../lib/prisma";
import { getPublicCategoryIds } from "../product/catalog.rules";
import { hashCartToken, isCartToken } from "./cart.cookie";
import { CartMergeReport } from "./cart.interface";
import { getCartItemStatus } from "./cart.mapper";
import { guestCutoff, lockCustomer, lockGuest } from "./cart.repository";
import { variantAvailabilitySelect } from "./cart.select";

export const createCartMergeService = (db: PrismaClient) => ({
  merge: async (userId: string, token: unknown): Promise<CartMergeReport> => {
    if (!isCartToken(token)) return { merged: false, adjustments: [] };
    const tokenHash = hashCartToken(token);
    return db.$transaction(async (tx) => {
      // Consistent lock order: customer first, then guest. A second login waits,
      // rechecks the guest row, and becomes a no-op after the first consumes it.
      let customer = await lockCustomer(tx, userId);
      const guest = await tx.cart.findUnique({
        where: { guestTokenHash: tokenHash },
        select: { id: true },
      });
      if (!guest || !(await lockGuest(tx, guest.id, tokenHash)))
        return { merged: false, adjustments: [] };
      const source = await tx.cart.findUniqueOrThrow({
        where: { id: guest.id },
        include: {
          items: {
            include: { variant: { select: variantAvailabilitySelect } },
          },
        },
      });
      const report: CartMergeReport = { merged: true, adjustments: [] };
      const publicCategories = await getPublicCategoryIds(tx);
      if (!customer && source.items.length)
        customer = await tx.customer.create({ data: { userId } });
      let target = customer
        ? await tx.cart.findUnique({
            where: { customerId: customer.id },
            include: { items: true },
          })
        : null;
      const quantities = new Map(
        target?.items.map((item) => [item.variantId, item.quantity]) ?? [],
      );
      const newLines: Prisma.CartItemCreateManyInput[] = [];
      const now = new Date();
      for (const item of source.items) {
        const current = quantities.get(item.variantId) ?? 0;
        const requested = current + item.quantity;
        const status = getCartItemStatus(
          item.variant,
          1,
          publicCategories,
          now,
        );
        if (status === "UNAVAILABLE" || status === "OUT_OF_STOCK") {
          report.adjustments.push({
            variantId: item.variantId,
            requestedQuantity: requested,
            retainedQuantity: current,
            reason: "UNAVAILABLE",
          });
          continue;
        }
        const quantity = Math.min(
          requested,
          item.variant.onHand - item.variant.reserved,
        );
        if (quantity !== requested)
          report.adjustments.push({
            variantId: item.variantId,
            requestedQuantity: requested,
            retainedQuantity: quantity,
            reason: "STOCK_CAP",
          });
        if (!target)
          target = await tx.cart.create({
            data: { customerId: customer!.id },
            include: { items: true },
          });
        if (current > 0)
          await tx.cartItem.update({
            where: {
              cartId_variantId: {
                cartId: target.id,
                variantId: item.variantId,
              },
            },
            data: { quantity },
          });
        else
          newLines.push({
            cartId: target.id,
            variantId: item.variantId,
            quantity,
          });
      }
      // Bulk insert distinct additions rather than issuing one upsert per line.
      if (newLines.length) await tx.cartItem.createMany({ data: newLines });
      if (target)
        await tx.cart.update({
          where: { id: target.id },
          data: { version: { increment: 1 } },
        });
      await tx.cart.delete({ where: { id: source.id } });
      return report;
    });
  },
  cleanup: async (now = new Date()) =>
    db.cart.deleteMany({
      where: {
        customerId: null,
        guestTokenHash: { not: null },
        updatedAt: { lte: guestCutoff(now) },
      },
    }),
});

export const CartMergeService = createCartMergeService(prisma);
