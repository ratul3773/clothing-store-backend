export const normalizeSku = (value: string): string =>
  value.trim().toUpperCase().replace(/\s+/g, "-");

export const buildSkuCandidate = (input: {
  productCode: string;
  color: string;
  size: string;
}): string => {
  const token = (value: string) =>
    value
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "")
      .slice(0, 8) || "X";

  return normalizeSku(
    `${token(input.productCode)}-${token(input.color)}-${token(input.size)}`.slice(
      0,
      64,
    ),
  );
};

export const buildUniqueSku = async (
  input: Parameters<typeof buildSkuCandidate>[0],
  exists: (sku: string) => Promise<boolean>,
): Promise<string> => {
  const base = buildSkuCandidate(input);
  let candidate = base;
  let suffix = 2;

  while (await exists(candidate)) {
    candidate = `${base.slice(0, 60)}-${suffix}`;
    suffix += 1;
  }

  return candidate;
};
