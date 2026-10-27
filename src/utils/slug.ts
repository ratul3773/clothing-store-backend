export const slugify = (value: string): string => {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized.slice(0, 200);
};

export const buildUniqueSlug = (
  base: string,
  exists: (slug: string) => Promise<boolean>,
  fallback = "item",
): Promise<string> => {
  return (async () => {
    const root = slugify(base) || slugify(fallback) || "item";
    let candidate = root;
    let suffix = 2;

    while (await exists(candidate)) {
      candidate = `${root}-${suffix}`.slice(0, 200);
      suffix += 1;
    }

    return candidate;
  })();
};
