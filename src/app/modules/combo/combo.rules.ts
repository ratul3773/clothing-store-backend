import { Prisma } from "../../../generated/prisma/client";
import ApiError from "../../../errors/ApiError";
import { isVariantPublic } from "../product/catalog.rules";
import type { ComboAvailability } from "./combo.select";

export type VariantDemand = { variantId: string; quantity: number };

export const isComboVariantAllowed = (
  item: { variantIds?: readonly string[] },
  variantId: string,
) => !item.variantIds?.length || item.variantIds.includes(variantId);

export const safeInteger = (value: number): number => {
  if (!Number.isSafeInteger(value))
    throw new ApiError(
      422,
      "Cart amount exceeds the supported integer precision",
    );
  return value;
};

export const comboItemsError = (
  items: readonly { colorId: string; quantity: number }[],
): string | null => {
  if (
    items.some(
      (item) =>
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 3,
    )
  )
    return "Component quantities must be positive integers up to three";
  const total = items.reduce((sum, item) => sum + item.quantity, 0);
  if (total < 2 || total > 3)
    return "A combo must contain two or three physical pieces";
  if (new Set(items.map((item) => item.colorId)).size !== items.length)
    return "Duplicate colors are not allowed; use quantity for repeated pieces";
  return null;
};

export const isComboPublic = (
  combo: ComboAvailability,
  publicIds: ReadonlySet<string>,
  now: Date,
) =>
  combo.isActive &&
  (!combo.startsAt || combo.startsAt <= now) &&
  (!combo.endsAt || combo.endsAt > now) &&
  comboItemsError(combo.items) === null &&
  combo.items.every((item) =>
    item.color.variants.some(
      (variant) =>
        isComboVariantAllowed(item, variant.id) &&
        variant.productId === item.color.product.id &&
        isVariantPublic(
          { ...variant, product: item.color.product },
          publicIds,
          now,
        ),
    ),
  );

export const comboCapacity = (
  combo: ComboAvailability,
  publicIds: ReadonlySet<string>,
  now = new Date(),
) =>
  comboItemsError(combo.items)
    ? 0
    : Math.max(
        0,
        Math.min(
          ...combo.items.map((item) =>
            Math.max(
              0,
              ...item.color.variants
                .filter(
                  (variant) =>
                    isComboVariantAllowed(item, variant.id) &&
                    variant.productId === item.color.product.id &&
                    isVariantPublic(
                      { ...variant, product: item.color.product },
                      publicIds,
                      now,
                    ),
                )
                .map((variant) =>
                  Math.floor(
                    (variant.onHand - variant.reserved) / item.quantity,
                  ),
                ),
            ),
          ),
          0x7fffffff,
        ),
      );

export type ComboSelection = { comboItemId: string; variantId: string };
export const comboSelectionKey = (selections: readonly ComboSelection[]) =>
  [...selections]
    .sort((a, b) =>
      a.comboItemId < b.comboItemId
        ? -1
        : a.comboItemId > b.comboItemId
          ? 1
          : 0,
    )
    .map((item) => `${item.comboItemId}:${item.variantId}`)
    .join("|");

/** Never infer a customer's size, including for a component with only one variant. */
export const resolveComboSelections = <
  Product extends { id: string },
  Variant extends { id: string; productId: string },
>(
  combo: {
    items: readonly {
      id: string;
      quantity: number;
      variantIds?: readonly string[];
      color: { product: Product; variants: readonly Variant[] };
    }[];
  },
  selections: readonly ComboSelection[],
) => {
  if (
    selections.length !== combo.items.length ||
    new Set(selections.map((item) => item.comboItemId)).size !==
      selections.length
  )
    return null;
  const byItem = new Map(
    selections.map((item) => [item.comboItemId, item.variantId]),
  );
  const components = [];
  for (const item of combo.items) {
    const variant = item.color.variants.find(
      (variant) => variant.id === byItem.get(item.id),
    );
    if (
      !variant ||
      !isComboVariantAllowed(item, variant.id) ||
      variant.productId !== item.color.product.id
    )
      return null;
    components.push({
      variantId: variant.id,
      quantity: item.quantity,
      variant: { ...variant, product: item.color.product },
    });
  }
  return components;
};

// Shared expansion boundary for carts and a future transactional checkout.
export const addVariantDemand = (
  demand: Map<string, number>,
  items: readonly VariantDemand[],
  quantity: number,
) => {
  for (const item of items)
    demand.set(
      item.variantId,
      safeInteger(
        (demand.get(item.variantId) ?? 0) +
          safeInteger(item.quantity * quantity),
      ),
    );
};

// Cart additions and content updates acquire the same row lock before reading components.
export const lockCombo = async (tx: Prisma.TransactionClient, id: string) => {
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM combos WHERE id = ${id} FOR UPDATE`;
  if (!rows.length) throw new ApiError(404, "Combo not found");
};
