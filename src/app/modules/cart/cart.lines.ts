import { Prisma } from "../../../generated/prisma/client";
import { comboAvailabilitySelect, comboInclude } from "../combo/combo.select";
import { addVariantDemand, isComboPublic, safeInteger, type VariantDemand } from "../combo/combo.rules";
import { mapCombo } from "../combo/combo.mapper";
import { isVariantPublic, resolveActiveOffer } from "../product/catalog.rules";
import type { CartDto, CartItemStatus } from "./cart.interface";
import { mapCart } from "./cart.mapper";
import { cartInclude, cartSummarySelect, type CartAvailabilityVariant } from "./cart.select";

export type DemandLine = {
  id: string; type: "VARIANT" | "COMBO"; quantity: number; unitPrice: number;
  eligible: boolean; components: Array<VariantDemand & { variant: CartAvailabilityVariant }>;
};
export const cartComboSummarySelect = {
  id: true, comboId: true, quantity: true,
  combo: { select: comboAvailabilitySelect },
} satisfies Prisma.CartComboSelect;

export const loadDemandLines = async (tx: Prisma.TransactionClient, cartId: string, publicIds: ReadonlySet<string>, now: Date): Promise<DemandLine[]> => {
  const items = await tx.cartItem.findMany({ where: { cartId }, select: cartSummarySelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const combos = await tx.cartCombo.findMany({ where: { cartId }, select: cartComboSummarySelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  return [
    ...items.map((item): DemandLine => ({
      id: item.id, type: "VARIANT", quantity: item.quantity,
      unitPrice: resolveActiveOffer(item.variant.product.offers, item.variant.product.regularPrice, now)?.offerPrice ?? item.variant.product.regularPrice,
      eligible: isVariantPublic(item.variant, publicIds, now),
      components: [{ variantId: item.variant.id, quantity: 1, variant: item.variant }],
    })),
    ...combos.map((item): DemandLine => ({
      id: item.id, type: "COMBO", quantity: item.quantity, unitPrice: item.combo.price,
      eligible: isComboPublic(item.combo, publicIds, now), components: item.combo.items,
    })),
  ];
};

export const demandForLines = (lines: readonly DemandLine[], exclude?: string) => {
  const demand = new Map<string, number>();
  for (const line of lines) if (line.id !== exclude) addVariantDemand(demand, line.components, line.quantity);
  return demand;
};

export const remainingCapacity = (components: DemandLine["components"], demand: ReadonlyMap<string, number>) => Math.max(0, Math.min(
  ...components.map((item) => Math.floor((item.variant.onHand - item.variant.reserved - (demand.get(item.variantId) ?? 0)) / item.quantity)),
  0x7fffffff,
));

export const summarizeLines = (lines: DemandLine[]) => {
  const demand = demandForLines(lines);
  const states = new Map<string, { status: CartItemStatus; maxQuantity: number; lineSubtotal: number | null }>();
  for (const line of lines) {
    const maxQuantity = line.eligible ? Math.max(0, Math.min(...line.components.map((item) => {
      const others = (demand.get(item.variantId) ?? 0) - item.quantity * line.quantity;
      return Math.floor((item.variant.onHand - item.variant.reserved - others) / item.quantity);
    }))) : 0;
    const noStock = line.components.some((item) => item.variant.onHand - item.variant.reserved < item.quantity);
    const status: CartItemStatus = !line.eligible ? "UNAVAILABLE" : noStock ? "OUT_OF_STOCK" : line.quantity > maxQuantity ? "INSUFFICIENT_STOCK" : "AVAILABLE";
    states.set(line.id, { status, maxQuantity, lineSubtotal: line.eligible ? safeInteger(line.unitPrice * line.quantity) : null });
  }
  const selectionItems = lines.map((line) => ({ id: line.id, type: line.type, status: states.get(line.id)!.status, lineSubtotal: states.get(line.id)!.lineSubtotal }));
  return {
    states,
    summary: {
      selectionItems, distinctItemCount: lines.length,
      totalQuantity: safeInteger(lines.reduce((sum, line) => sum + line.quantity, 0)),
      validItemsSubtotal: safeInteger(selectionItems.reduce((sum, item) => sum + (item.status === "AVAILABLE" ? item.lineSubtotal ?? 0 : 0), 0)),
      allItemsAvailable: lines.length > 0 && selectionItems.every((line) => line.status === "AVAILABLE"),
    },
  };
};

export type CartPageId = { id: string; type: "VARIANT" | "COMBO" };
export const pageCartIds = (tx: Prisma.TransactionClient, cartId: string, skip: number, limit: number) =>
  tx.$queryRaw<CartPageId[]>`
    SELECT id, type FROM (
      SELECT id, 'VARIANT' AS type, "createdAt" FROM cart_items WHERE "cartId" = ${cartId}
      UNION ALL
      SELECT id, 'COMBO' AS type, "createdAt" FROM cart_combos WHERE "cartId" = ${cartId}
    ) AS lines ORDER BY "createdAt" ASC, type ASC, id ASC OFFSET ${skip} LIMIT ${limit}
  `;

export const hydrateCart = async (
  tx: Prisma.TransactionClient, header: { id: string; version: number } | null,
  lines: DemandLine[], publicIds: ReadonlySet<string>, now: Date, pageIds?: CartPageId[],
): Promise<CartDto> => {
  const ids = pageIds ?? lines.map(({ id, type }) => ({ id, type }));
  const variants = ids.filter((item) => item.type === "VARIANT").map((item) => item.id);
  const combos = ids.filter((item) => item.type === "COMBO").map((item) => item.id);
  const cart = header ? await tx.cart.findUnique({ where: { id: header.id }, include: {
    items: { ...cartInclude.items, where: { id: { in: variants } } },
    combos: { where: { id: { in: combos } }, include: { combo: { include: comboInclude } } },
  } }) : null;
  const mapped = mapCart(cart, publicIds, now);
  const { states, summary } = summarizeLines(lines);
  const mappedItems = new Map(mapped.items.map((item) => [item.id, item]));
  for (const item of cart?.combos ?? []) {
    const state = states.get(item.id)!;
    mappedItems.set(item.id, {
      id: item.id, type: "COMBO", comboId: item.comboId, variantId: null, quantity: item.quantity,
      ...state, combo: state.status === "UNAVAILABLE" ? null : mapCombo(item.combo),
      product: null, variant: null, regularPrice: null,
      unitPrice: state.status === "UNAVAILABLE" ? null : item.combo.price,
    });
  }
  return { ...mapped, ...summary, items: ids.flatMap(({ id }) => {
    const item = mappedItems.get(id);
    return item ? [{ ...item, ...states.get(id)! }] : [];
  }) };
};
