const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";

const toEnglishDigits = (value: string) =>
  value.replace(/[০-৯]/g, (digit) => {
    const index = BANGLA_DIGITS.indexOf(digit);
    return index === -1 ? digit : String(index);
  });

export const normalizeBdPhone = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  const trimmed = toEnglishDigits(value)
    .trim()
    .replace(/[\s()-]/g, "");

  if (/^\+8801[3-9]\d{8}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^8801[3-9]\d{8}$/.test(trimmed)) {
    return `+${trimmed}`;
  }

  if (/^01[3-9]\d{8}$/.test(trimmed)) {
    return `+88${trimmed}`;
  }

  return null;
};
