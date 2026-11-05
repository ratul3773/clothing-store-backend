import { Prisma } from "../../../generated/prisma/client";
import { comboAvailabilitySelect, comboInclude } from "../combo/combo.select";
import {
  addVariantDemand,
  isComboPublic,
  isComboVariantAllowed,
  safeInteger,
  resolveComboSelections,
  type VariantDemand,
} from "../combo/combo.rules";

import type { CartSnapshot } from "./cart.snapshot";
import { mapCombo } from "../combo/combo.mapper";
import { isVariantPublic, resolveActiveOffer } from "../product/catalog.rules";
import type { CartDto, CartItemStatus } from "./cart.interface";
import { mapCart } from "./cart.mapper";
import {
  cartInclude,
  cartSummarySelect,
  type CartAvailabilityVariant,
} from "./cart.select";

export type DemandLine = {
  id: string;
  createdAt: Date;
  type: "VARIANT" | "COMBO";
  quantity: number;
  unitPrice: number;
  eligible: boolean;
  components: Array<VariantDemand & { variant: CartAvailabilityVariant }>;
  selectionIssue?: "INCOMPLETE" | "INVALID" | null;
};
export const cartComboSummarySelect = {
  id: true,
  createdAt: true,
  comboId: true,
  quantity: true,
  selections: { select: { comboItemId: true, variantId: true } },
  combo: { select: comboAvailabilitySelect },
} satisfies Prisma.CartComboSelect;

export const buildDemandLines = (
  snapshot: CartSnapshot,
  publicIds: ReadonlySet<string>,
  now: Date,
): DemandLine[] => {
  // 1. Build variant demand lines
  const variantLines: DemandLine[] = snapshot.items.map((item) => {
    const { variant } = item;
    const { product } = variant;

    const activeOffer = resolveActiveOffer(
      product.offers,
      product.regularPrice,
      now,
    );

    return {
      id: item.id,
      createdAt: item.createdAt,
      type: "VARIANT",
      quantity: item.quantity,
      unitPrice: activeOffer?.offerPrice ?? product.regularPrice,
      eligible: isVariantPublic(variant, publicIds, now),
      components: [
        {
          variantId: variant.id,
          quantity: 1,
          variant,
        },
      ],
    };
  });

  // 2. Build combo demand lines
  const comboLines: DemandLine[] = snapshot.combos.map((item) => {
    const combo = item.combo;

    const components = resolveComboSelections(
      combo,
      item.selections,
    );

    const visible = isComboPublic(
      combo,
      publicIds,
      now,
    );

    const componentMap = new Map(
      combo.items.map((component) => [
        component.id,
        component,
      ]),
    );

    const invalidChoice = item.selections.some((selection) => {
      const component = componentMap.get(selection.comboItemId);

      if (!component) return true;

      const variant = component.color.variants.find(
        (variant) => variant.id === selection.variantId,
      );

      if (!variant) return true;

      return (
        !isComboVariantAllowed(component, variant.id) ||
        variant.productId !== component.color.product.id ||
        !isVariantPublic(
          {
            ...variant,
            product: component.color.product,
          },
          publicIds,
          now,
        )
      );
    });

    const selectionIssue: DemandLine["selectionIssue"] =
      !visible
        ? null
        : invalidChoice ||
            item.selections.length > combo.items.length
          ? "INVALID"
          : !components
            ? "INCOMPLETE"
            : null;

    return {
      id: item.id,
      createdAt: item.createdAt,
      type: "COMBO",
      quantity: item.quantity,
      unitPrice: combo.price,
      eligible:
        visible &&
        !!components &&
        components.length > 0 &&
        !selectionIssue,
      selectionIssue,
      components: components ?? [],
    };
  });

  // 3. Return both variant and combo lines
  return [...variantLines, ...comboLines];
};

export const loadDemandLines = async (
  tx: Prisma.TransactionClient,
  cartId: string,
  publicIds: ReadonlySet<string>,
  now: Date,
): Promise<DemandLine[]> => {
  // Fetch only combo IDs initially. This avoids requesting the full nested
  // combo graph for carts with no combos. Benchmark against the single-query
  // approach: carts with combos incur one extra round trip.
  const [items, comboHeaders] = await Promise.all([
    tx.cartItem.findMany({
      where: { cartId },
      select: cartSummarySelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    tx.cartCombo.findMany({
      where: { cartId },
      select: { id: true },
    }),
  ]);

  const combos = comboHeaders.length
    ? await tx.cartCombo.findMany({
        where: { cartId, id: { in: comboHeaders.map(({ id }) => id) } },
        select: cartComboSummarySelect,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })
    : [];

  const variantLines: DemandLine[] = items.map((item) => {
    const product = item.variant.product;

    const activeOffer = resolveActiveOffer(
      product.offers,
      product.regularPrice,
      now,
    );

    return {
      id: item.id,
      createdAt: item.createdAt,
      type: "VARIANT",
      quantity: item.quantity,
      unitPrice: activeOffer?.offerPrice ?? product.regularPrice,
      eligible: isVariantPublic(item.variant, publicIds, now),
      components: [
        {
          variantId: item.variant.id,
          quantity: 1,
          variant: item.variant,
        },
      ],
    };
  });

  const comboLines: DemandLine[] = combos.map((item) => {
    const combo = item.combo;
    const components = resolveComboSelections(
      combo,
      item.selections,
    );

    const visible = isComboPublic(combo, publicIds, now);

    const componentMap = new Map(
      combo.items.map((component) => [
        component.id,
        component,
      ]),
    );

    const invalidChoice = item.selections.some((selection) => {
      const component = componentMap.get(selection.comboItemId);

      if (!component) return true;

      const variant = component.color.variants.find(
        (variant) => variant.id === selection.variantId,
      );

      if (!variant) return true;

      return (
        !isComboVariantAllowed(component, variant.id) ||
        variant.productId !== component.color.product.id ||
        !isVariantPublic(
          {
            ...variant,
            product: component.color.product,
          },
          publicIds,
          now,
        )
      );
    });

    const selectionIssue = !visible
      ? null
      : invalidChoice ||
          item.selections.length > combo.items.length
        ? "INVALID"
        : !components
          ? "INCOMPLETE"
          : null;

    return {
      id: item.id,
      createdAt: item.createdAt,
      type: "COMBO",
      quantity: item.quantity,
      unitPrice: combo.price,
      eligible:
        visible &&
        !!components &&
        components.length > 0 &&
        !selectionIssue,
      selectionIssue,
      components: components ?? [],
    };
  });

  return [...variantLines, ...comboLines];
};

export const demandForLines = (
  lines: readonly DemandLine[],
  exclude?: string,
) => {
  const demand = new Map<string, number>();
  for (const line of lines)
    if (line.id !== exclude)
      addVariantDemand(demand, line.components, line.quantity);
  return demand;
};

// Demand counts saved choices even for hidden products. Incomplete/invalid combo
// choices contribute nothing, exactly as resolveComboSelections in the full read.
export const loadStockDemand = async (
  db: Prisma.TransactionClient,
  cart: {
    id: string;
    items: readonly { id: string; variantId: string; quantity: number }[];
    combos: readonly { id: string }[];
  } | null,
  exclude?: string,
) => {
  const demand = new Map<string, number>();
  if (!cart) return demand;
  for (const item of cart.items)
    if (item.id !== exclude)
      addVariantDemand(demand, [{ variantId: item.variantId, quantity: 1 }], item.quantity);
  if (!cart.combos.some((item) => item.id !== exclude)) return demand;
  const combos = await db.cartCombo.findMany({
    where: { cartId: cart.id, ...(exclude ? { id: { not: exclude } } : {}) },
    select: {
      quantity: true,
      selections: { select: { comboItemId: true, variantId: true } },
      combo: { select: { items: { select: {
        id: true, quantity: true, variantIds: true,
        color: { select: {
          product: { select: { id: true } },
          variants: { select: { id: true, productId: true } },
        } },
      } } } },
    },
  });
  for (const item of combos)
    addVariantDemand(demand, resolveComboSelections(item.combo, item.selections) ?? [], item.quantity);
  return demand;
};

export const remainingCapacity = (
  components: DemandLine["components"],
  demand: ReadonlyMap<string, number>,
) =>
  !components.length
    ? 0
    : Math.max(
        0,
        Math.min(
          ...components.map((item) =>
            Math.floor(
              (item.variant.onHand -
                item.variant.reserved -
                (demand.get(item.variantId) ?? 0)) /
                item.quantity,
            ),
          ),
          0x7fffffff,
        ),
      );

export const summarizeLines = (lines: DemandLine[]) => {
  // Reads tolerate a malformed legacy row; writes still use strict demandForLines.
  const invalid = new Set<string>();
  let demand = new Map<string, number>();
  let subtotalBudget = 0;
  for (const line of lines) {
    try {
      safeInteger(line.quantity);
      const subtotal = safeInteger(line.unitPrice * line.quantity);
      const next = new Map(demand);
      addVariantDemand(next, line.components, line.quantity);
      const budget = safeInteger(
        subtotalBudget + (line.eligible ? subtotal : 0),
      );
      demand = next;
      subtotalBudget = budget;
    } catch {
      invalid.add(line.id);
    }
  }
  const states = new Map<
    string,
    { status: CartItemStatus; maxQuantity: number; lineSubtotal: number | null }
  >();
  for (const line of lines) {
    const eligible =
      line.eligible && line.components.length > 0 && !invalid.has(line.id);
    const maxQuantity = eligible
      ? Math.max(
          0,
          Math.min(
            ...line.components.map((item) => {
              const others =
                (demand.get(item.variantId) ?? 0) -
                item.quantity * line.quantity;
              return Math.floor(
                (item.variant.onHand - item.variant.reserved - others) /
                  item.quantity,
              );
            }),
          ),
        )
      : 0;
    const noStock = line.components.some(
      (item) => item.variant.onHand - item.variant.reserved < item.quantity,
    );
    // Read availability is symmetric: every line sharing overcommitted stock fails.
    const status: CartItemStatus = invalid.has(line.id)
      ? "UNAVAILABLE"
      : line.selectionIssue === "INCOMPLETE"
        ? "SELECTION_REQUIRED"
        : !eligible
          ? "UNAVAILABLE"
          : noStock
            ? "OUT_OF_STOCK"
            : line.quantity > maxQuantity
              ? "INSUFFICIENT_STOCK"
              : "AVAILABLE";
    states.set(line.id, {
      status,
      maxQuantity,
      lineSubtotal: eligible
        ? safeInteger(line.unitPrice * line.quantity)
        : null,
    });
  }
  const selectionItems = lines.map((line) => ({
    id: line.id,
    type: line.type,
    status: states.get(line.id)!.status,
    lineSubtotal: states.get(line.id)!.lineSubtotal,
  }));
  return {
    states,
    summary: {
      selectionItems,
      distinctItemCount: lines.length,
      totalQuantity: safeInteger(
        lines.reduce((sum, line) => sum + line.quantity, 0),
      ),
      validItemsSubtotal: safeInteger(
        selectionItems.reduce(
          (sum, item) =>
            sum + (item.status === "AVAILABLE" ? (item.lineSubtotal ?? 0) : 0),
          0,
        ),
      ),
      allItemsAvailable:
        lines.length > 0 &&
        selectionItems.every((line) => line.status === "AVAILABLE"),
    },
  };
};

export type CartPageId = { id: string; type: "VARIANT" | "COMBO" };
export const orderedCartIds = (lines: readonly DemandLine[]): CartPageId[] =>
  [...lines].sort((a, b) =>
    a.createdAt.getTime() - b.createdAt.getTime() ||
    (a.type < b.type ? -1 : a.type > b.type ? 1 : 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  ).map(({ id, type }) => ({ id, type }));
export const pageCartIds = (
  tx: Prisma.TransactionClient,
  cartId: string,
  skip: number,
  limit: number,
) =>
  tx.$queryRaw<CartPageId[]>`
    SELECT id, type FROM (
      SELECT id, 'VARIANT' AS type, "createdAt" FROM cart_items WHERE "cartId" = ${cartId}
      UNION ALL
      SELECT id, 'COMBO' AS type, "createdAt" FROM cart_combos WHERE "cartId" = ${cartId}
    ) AS lines ORDER BY "createdAt" ASC, type ASC, id ASC OFFSET ${skip} LIMIT ${limit}
  `;

export const hydrateCart = async (
  tx: Prisma.TransactionClient,
  header: { id: string; version: number } | null,
  lines: DemandLine[],
  publicIds: ReadonlySet<string>,
  now: Date,
  pageIds?: CartPageId[],
): Promise<CartDto> => {
  const ids = pageIds ?? lines.map(({ id, type }) => ({ id, type }));
  const variants = ids
    .filter((item) => item.type === "VARIANT")
    .map((item) => item.id);
  const combos = ids
    .filter((item) => item.type === "COMBO")
    .map((item) => item.id);
  const [items, comboItems] = await Promise.all([
    header && variants.length ? tx.cartItem.findMany({
      ...cartInclude.items,
      where: { cartId: header.id, id: { in: variants } },
    }) : [],
    header && combos.length ? tx.cartCombo.findMany({
      where: { cartId: header.id, id: { in: combos } },
      include: {
        combo: { include: comboInclude },
        selections: { include: { variant: { select: { size: true } } } },
      },
    }) : [],
  ]);
  const cart = header ? { ...header, items, combos: comboItems } : null;
  const { states, summary } = summarizeLines(lines);
  const mapped = mapCart(
    cart
      ? {
          ...cart,
          items: cart.items.filter(
            (item) => states.get(item.id)?.status !== "UNAVAILABLE",
          ),
        }
      : null,
    publicIds,
    now,
  );
  const mappedItems = new Map(mapped.items.map((item) => [item.id, item]));
  const lineMap = new Map(lines.map((line) => [line.id, line]));
  for (const item of cart?.items ?? [])
    if (!mappedItems.has(item.id))
      mappedItems.set(item.id, {
        id: item.id,
        type: "VARIANT",
        variantId: item.variantId,
        quantity: item.quantity,
        ...states.get(item.id)!,
        product: null,
        variant: null,
        regularPrice: null,
        unitPrice: null,
      });
  for (const item of cart?.combos ?? []) {
    const state = states.get(item.id)!;
    const visible = isComboPublic(item.combo, publicIds, now);
    const resolved = resolveComboSelections(item.combo, item.selections);
    mappedItems.set(item.id, {
      id: item.id,
      type: "COMBO",
      comboId: visible ? item.comboId : null,
      variantId: null,
      quantity: item.quantity,
      ...state,
      combo: visible ? mapCombo(item.combo, now, publicIds) : null,
      requiresSelection:
        visible &&
        (!resolved ||
          lineMap.get(item.id)?.selectionIssue ===
            "INVALID"),
      selectionIssue: visible
        ? (lineMap.get(item.id)?.selectionIssue ?? null)
        : null,
      selections: visible
        ? item.selections.map((selection) => ({
            comboItemId: selection.comboItemId,
            variantId: selection.variantId,
            size: selection.variant.size,
          }))
        : [],
      product: null,
      variant: null,
      regularPrice: null,
      unitPrice: state.status === "UNAVAILABLE" ? null : item.combo.price,
    });
  }
  return {
    ...mapped,
    ...summary,
    items: ids.flatMap(({ id }) => {
      const item = mappedItems.get(id);
      return item ? [{ ...item, ...states.get(id)! }] : [];
    }),
  };
};

export const hydrateCartFromSnapshot = (
  header: { id: string; version: number } | null,
  snapshot: CartSnapshot,
  lines: DemandLine[],
  publicIds: ReadonlySet<string>,
  now: Date,
  pageIds?: CartPageId[],
): CartDto => {
  const ids =
    pageIds ??
    lines.map(({ id, type }) => ({ id, type }));

  const variantIds = new Set(
    ids
      .filter((item) => item.type === "VARIANT")
      .map((item) => item.id),
  );

  const comboIds = new Set(
    ids
      .filter((item) => item.type === "COMBO")
      .map((item) => item.id),
  );

  const items = snapshot.items.filter(
    (item) => variantIds.has(item.id),
  );

  const comboItems = snapshot.combos.filter(
    (item) => comboIds.has(item.id),
  );

  // Continue with your existing hydrateCart() logic
  // starting from:
  //
  // const cart = header
  //   ? { ...header, items, combos: comboItems }
  //   : null;
  //
  // No additional database queries are needed.
  const cart = header ? { ...header, items, combos: comboItems } : null;
  const { states, summary } = summarizeLines(lines);
  const mapped = mapCart(
    cart
      ? {
          ...cart,
          items: cart.items.filter(
            (item) => states.get(item.id)?.status !== "UNAVAILABLE",
          ),
        }
      : null,
    publicIds,
    now,
  );
  const mappedItems = new Map(mapped.items.map((item) => [item.id, item]));
  const lineMap = new Map(lines.map((line) => [line.id, line]));
  for (const item of cart?.items ?? [])
    if (!mappedItems.has(item.id))
      mappedItems.set(item.id, {
        id: item.id,
        type: "VARIANT",
        variantId: item.variantId,
        quantity: item.quantity,
        ...states.get(item.id)!,
        product: null,
        variant: null,
        regularPrice: null,
        unitPrice: null,
      });
  for (const item of cart?.combos ?? []) {
    const state = states.get(item.id)!;
    const visible = isComboPublic(item.combo, publicIds, now);
    const resolved = resolveComboSelections(item.combo, item.selections);
    mappedItems.set(item.id, {
      id: item.id,
      type: "COMBO",
      comboId: visible ? item.comboId : null,
      variantId: null,
      quantity: item.quantity,
      ...state,
      combo: visible ? mapCombo(item.combo, now, publicIds) : null,
      requiresSelection:
        visible &&
        (!resolved ||
          lineMap.get(item.id)?.selectionIssue ===
            "INVALID"),
      selectionIssue: visible
        ? (lineMap.get(item.id)?.selectionIssue ?? null)
        : null,
      selections: visible
        ? item.selections.map((selection) => ({
            comboItemId: selection.comboItemId,
            variantId: selection.variantId,
            size: selection.variant.size,
          }))
        : [],
      product: null,
      variant: null,
      regularPrice: null,
      unitPrice: state.status === "UNAVAILABLE" ? null : item.combo.price,
    });
  }
  return {
    ...mapped,
    ...summary,
    items: ids.flatMap(({ id }) => {
      const item = mappedItems.get(id);
      return item ? [{ ...item, ...states.get(id)! }] : [];
    }),
  };
};
