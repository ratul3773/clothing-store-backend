import { PrismaClient } from "../../../generated/prisma/client";
import { prisma } from "../../../lib/prisma";
import { getPublicCategoryIds } from "../product/catalog.rules";
import { addVariantDemand } from "../combo/combo.rules";
import { hashCartToken, isCartToken } from "./cart.cookie";
import { CART_LINE_LIMIT, CART_QUANTITY_STORAGE_MAX } from "./cart.constants";
import { CartMergeReport } from "./cart.interface";
import { demandForLines, loadDemandLines, remainingCapacity } from "./cart.lines";
import { guestCutoff, lockCustomer, lockGuest } from "./cart.repository";

export const createCartMergeService = (db: PrismaClient) => ({
  merge: async (userId: string, token: unknown): Promise<CartMergeReport> => {
    if (!isCartToken(token)) return { merged: false, adjustments: [] };
    const tokenHash = hashCartToken(token);
    return db.$transaction(async (tx) => {
      // Always lock customer before guest. Replayed login consumes no cart twice.
      let customer = await lockCustomer(tx, userId);
      const guest = await tx.cart.findUnique({ where: { guestTokenHash: tokenHash }, select: { id: true } });
      if (!guest || !(await lockGuest(tx, guest.id, tokenHash))) return { merged: false, adjustments: [] };
      const publicIds = await getPublicCategoryIds(tx);
      const now = new Date();
      const source = await loadDemandLines(tx, guest.id, publicIds, now);
      // Source combo references remain until the final delete, preventing content edits
      // throughout the transfer without acquiring combo locks in conflicting orders.
      const sourceCombos = await tx.cartCombo.findMany({ where: { cartId: guest.id }, select: { id: true, comboId: true, selectionKey: true, selections: { select: { comboItemId: true, variantId: true } } } });
      const comboIds = new Map(sourceCombos.map((item) => [item.id, item]));
      let target = customer ? await tx.cart.findUnique({ where: { customerId: customer.id }, select: { id: true } }) : null;
      const targetLines = target ? await loadDemandLines(tx, target.id, publicIds, now) : [];
      const targetCombos = target ? await tx.cartCombo.findMany({ where: { cartId: target.id }, select: { id: true, comboId: true, selectionKey: true, selections: { select: { comboItemId: true, variantId: true } } } }) : [];
      const targetComboIds = new Map(targetCombos.map((item) => [item.id, item]));
      const keyFor = (type: "VARIANT" | "COMBO", id: string) => `${type}:${id}`;
      const quantities = new Map(targetLines.map((line) => [
        keyFor(line.type, line.type === "VARIANT" ? line.components[0]!.variantId : `${targetComboIds.get(line.id)!.comboId}:${targetComboIds.get(line.id)!.selectionKey}`), line.quantity,
      ]));
      const demand = demandForLines(targetLines);
      const report: CartMergeReport = { merged: true, adjustments: [] };
      let lineCount = targetLines.length;
      // Merge allocates greedily: guest variants, then combos, each in creation/id
      // order. Existing account demand wins. In contrast,
      // cart reads mark every line on an overcommitted variant insufficient.
      for (const line of source) {
        const configuration = line.type === "COMBO" ? comboIds.get(line.id)! : null;
        const identifier = line.type === "VARIANT" ? line.components[0]!.variantId : configuration!.comboId;
        const key = keyFor(line.type, configuration ? `${identifier}:${configuration.selectionKey}` : identifier);
        const current = quantities.get(key) ?? 0;
        const requested = current + line.quantity;
        const limitReached = !quantities.has(key) && lineCount >= CART_LINE_LIMIT;
        const added = line.eligible && !limitReached ? Math.max(0, Math.min(line.quantity, remainingCapacity(line.components, demand), CART_QUANTITY_STORAGE_MAX - current)) : 0;
        const retained = current + added;
        if (retained !== requested) report.adjustments.push({
          ...(line.type === "VARIANT" ? { type: "VARIANT" as const, variantId: identifier } : { type: "COMBO" as const, comboId: identifier }),
          requestedQuantity: requested, retainedQuantity: retained,
          reason: limitReached ? "LINE_LIMIT" : !line.eligible || remainingCapacity(line.components, new Map()) === 0 ? "UNAVAILABLE" : "STOCK_CAP",
        });
        if (!added) continue;
        if (!customer) customer = await tx.customer.create({ data: { userId } });
        if (!target) target = await tx.cart.create({ data: { customerId: customer.id }, select: { id: true } });
        if (line.type === "VARIANT") await tx.cartItem.upsert({
          where: { cartId_variantId: { cartId: target.id, variantId: identifier } },
          create: { cartId: target.id, variantId: identifier, quantity: retained }, update: { quantity: retained },
        });
        else await tx.cartCombo.upsert({
          where: { cartId_comboId_selectionKey: { cartId: target.id, comboId: identifier, selectionKey: configuration!.selectionKey } },
          create: { cartId: target.id, comboId: identifier, quantity: retained, selectionKey: configuration!.selectionKey, selections: { create: configuration!.selections } }, update: { quantity: retained },
        });
        if (!quantities.has(key)) lineCount++;
        quantities.set(key, retained);
        addVariantDemand(demand, line.components, added);
      }
      if (target) await tx.cart.update({ where: { id: target.id }, data: { version: { increment: 1 } } });
      await tx.cart.delete({ where: { id: guest.id } });
      return report;
    });
  },
  cleanup: async (now = new Date()) => db.cart.deleteMany({
    where: { customerId: null, guestTokenHash: { not: null }, updatedAt: { lte: guestCutoff(now) } },
  }),
});

export const CartMergeService = createCartMergeService(prisma);
