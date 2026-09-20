// IDX symbols are four letters; Sectors returns them with a `.JK` suffix.

export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase().replace(/\.JK$/, "");
}

export function isValidSymbol(raw: string): boolean {
  return /^[A-Z]{4}$/.test(normalizeSymbol(raw));
}
