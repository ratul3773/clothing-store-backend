import { Prisma } from "../../../generated/prisma/client";
import ApiError from "../../../errors/ApiError";
import { isVariantPublic } from "../product/catalog.rules";
import type { ComboAvailability } from "./combo.select";

export type VariantDemand = { variantId: string; quantity: number };

export const safeInteger = (value: number): number => {
  if (!Number.isSafeInteger(value)) throw new ApiError(422, "Cart amount exceeds the supported integer precision");
  return value;
};

export const comboItemsError = (items: readonly VariantDemand[]): string | null => {
  if (items.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 3))
    return "Component quantities must be positive integers up to three";
  const total = items.reduce((sum, item) => sum + item.quantity, 0);
  if (total < 2 || total > 3) return "A combo must contain two or three physical pieces";
  if (new Set(items.map((item) => item.variantId)).size !== items.length) return "Duplicate variant IDs are not allowed";
  return null;
};

export const isComboPublic = (combo: ComboAvailability, publicIds: ReadonlySet<string>, now: Date) =>
  combo.isActive && (!combo.startsAt || combo.startsAt <= now) &&
  (!combo.endsAt || combo.endsAt > now) &&
  comboItemsError(combo.items) === null &&
  combo.items.every((item) => isVariantPublic(item.variant, publicIds, now));

export const comboCapacity = (combo: ComboAvailability) => Math.max(0, Math.min(
  ...combo.items.map((item) => Math.floor((item.variant.onHand - item.variant.reserved) / item.quantity)),
  0x7fffffff,
));

// Shared expansion boundary for carts and a future transactional checkout.
export const addVariantDemand = (demand: Map<string, number>, items: readonly VariantDemand[], quantity: number) => {
  for (const item of items) demand.set(item.variantId, safeInteger((demand.get(item.variantId) ?? 0) + safeInteger(item.quantity * quantity)));
};

// Cart additions and content updates acquire the same row lock before reading components.
export const lockCombo = async (tx: Prisma.TransactionClient, id: string) => {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM combos WHERE id = ${id} FOR UPDATE`;
  if (!rows.length) throw new ApiError(404, "Combo not found");
};
