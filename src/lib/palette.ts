// Chart colors as literal values (canvas can't read CSS variables). They mirror
// the @theme tokens in globals.css. The categorical trio (foreign, retail,
// institution) passed the palette validator for all-pairs CVD separation on white.

export const P = {
  sheet: "#ffffff",
  ink: "#15213b",
  ink2: "#4a556b",
  ink3: "#626c80",
  rule: "#e1e5ec",
  ruleStrong: "#c9d0db",
  grid: "#eef1f6",
  kunyit: "#f2b233",
  kunyitDeep: "#8a5a00",
  upMark: "#008300",
  downMark: "#e34948",
  upWash: "rgba(0, 131, 0, 0.45)",
  downWash: "rgba(227, 73, 72, 0.45)",
  volume: "rgba(98, 108, 128, 0.32)",
  foreign: "#2a78d6",
  institution: "#4a3aa7",
  retail: "#eb6834",
  other: "#8a93a5",
  // Indicator overlays, in fixed order.
  s1: "#2a78d6",
  s2: "#eb6834",
  s3: "#4a3aa7",
  s4: "#d55181",
  band: "rgba(98, 108, 128, 0.75)",
} as const;

export const CATEGORY_HEX = {
  foreign: P.foreign,
  institution: P.institution,
  retail: P.retail,
  other: P.other,
} as const;
