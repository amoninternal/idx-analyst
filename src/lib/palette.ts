// Chart colors. The values live in CSS custom properties in globals.css, one set per theme.
//
// - `P` holds `var(--…)` references, for page markup and SVG: they follow the theme on their
//   own and render the same on the server and in the browser.
// - Canvas charts (lightweight-charts) can't read CSS variables, so they call `chartColors()`
//   when they build, which resolves the same names to the current theme's values. Those charts
//   rebuild when the theme changes (see useResolvedTheme).
//
// The categorical trio (foreign, institution, retail) is validated for color-blind separation
// in both themes.

const VARS = {
  sheet: "--color-sheet",
  ink: "--color-ink",
  ink2: "--color-ink-2",
  ink3: "--color-ink-3",
  rule: "--color-rule",
  ruleStrong: "--color-rule-strong",
  grid: "--chart-grid",
  kunyit: "--color-kunyit",
  kunyitDeep: "--color-kunyit-deep",
  upMark: "--color-up-mark",
  downMark: "--color-down-mark",
  foreign: "--color-foreign",
  institution: "--color-institution",
  retail: "--color-retail",
  other: "--color-other",
  // Indicator overlays, in fixed order.
  s1: "--chart-s1",
  s2: "--chart-s2",
  s3: "--chart-s3",
  s4: "--chart-s4",
  band: "--chart-band",
  watermark: "--chart-watermark",
  rating1: "--chart-rating-1",
  rating2: "--chart-rating-2",
  rating3: "--chart-rating-3",
  rating4: "--chart-rating-4",
  rating5: "--chart-rating-5",
} as const;

export type ColorKey = keyof typeof VARS;

/** Light-theme values, used before the page's styles can be read (never in practice on screen). */
const FALLBACK: Record<ColorKey, string> = {
  sheet: "#ffffff",
  ink: "#14213d",
  ink2: "#465267",
  ink3: "#5d677b",
  rule: "#e1e5eb",
  ruleStrong: "#c7ced9",
  grid: "#eef1f5",
  kunyit: "#efae2e",
  kunyitDeep: "#7d5200",
  upMark: "#24935f",
  downMark: "#cc5248",
  foreign: "#2a78d6",
  institution: "#4a3aa7",
  retail: "#eb6834",
  other: "#8a93a5",
  s1: "#2a78d6",
  s2: "#eb6834",
  s3: "#4a3aa7",
  s4: "#d55181",
  band: "#8b93a3",
  watermark: "rgba(20, 33, 61, 0.07)",
  rating1: "#184f95",
  rating2: "#86b6ef",
  rating3: "#c3c2b7",
  rating4: "#ef9a9a",
  rating5: "#b03f36",
};

/** CSS references for markup and SVG. */
export const P = Object.fromEntries(Object.entries(VARS).map(([k, v]) => [k, `var(${v})`])) as Record<ColorKey, string>;

export const CATEGORY_HEX = {
  foreign: P.foreign,
  institution: P.institution,
  retail: P.retail,
  other: P.other,
} as const;

export type ChartColors = Record<ColorKey, string>;

/** The current theme's colors as real values, for canvas charts. Call it when a chart builds. */
export function chartColors(): ChartColors {
  if (typeof document === "undefined") return FALLBACK;
  const style = getComputedStyle(document.documentElement);
  const out = {} as ChartColors;
  for (const key of Object.keys(VARS) as ColorKey[]) out[key] = style.getPropertyValue(VARS[key]).trim() || FALLBACK[key];
  return out;
}

/** Resolves a `var(--…)` reference from `P` (or passes a literal color through), for canvas. */
export function resolveColor(color: string, colors: ChartColors = chartColors()): string {
  const m = /^var\((--[\w-]+)\)$/.exec(color);
  if (!m) return color;
  const key = (Object.keys(VARS) as ColorKey[]).find((k) => VARS[k] === m[1]);
  return key ? colors[key] : color;
}

/** `#rrggbb` with an alpha, for fills under lines and translucent bars. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = Number.parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
