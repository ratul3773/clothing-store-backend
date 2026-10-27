export const normalizeProductCode = (value: string): string =>
  value.trim().toUpperCase();

export const normalizeColorName = (value: string): string =>
  value.trim().replace(/\s+/g, " ");

export const normalizeSize = (value: string): string =>
  value.trim().toUpperCase().replace(/\s+/g, " ");

export const normalizeOptionalText = (
  value: string | null | undefined,
): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};
