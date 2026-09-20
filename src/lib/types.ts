// Shapes shared by API routes and client components.

export type Candle = {
  time: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // shares
};

export type PriceSource = "sectors" | "local-vwap";

export type CandleSeries = {
  symbol: string;
  source: PriceSource;
  candles: Candle[];
  /** Set when the data is a fallback or partial. */
  note?: string;
};

export type BrokerCategory = "foreign" | "institution" | "retail" | "other";

export const BROKER_CATEGORIES: BrokerCategory[] = ["foreign", "institution", "retail", "other"];

export const CATEGORY_LABEL: Record<BrokerCategory, string> = {
  foreign: "Foreign",
  institution: "Institution",
  retail: "Retail",
  other: "Other",
};

export type BrokerRow = {
  code: string;
  name: string;
  category: BrokerCategory;
  buyValue: number;
  buyVolume: number; // shares
  buyFreq: number;
  sellValue: number;
  sellVolume: number;
  sellFreq: number;
  netValue: number;
  netVolume: number;
  buyAvg: number | null;
  sellAvg: number | null;
};

export type DailyFlow = {
  date: string;
  value: number; // total traded value, one side
  volume: number; // total traded shares, one side
  vwap: number | null;
  net: Record<BrokerCategory, number>;
};

export type SourceSpan = { kind: "local" | "sectors"; from: string; to: string; days: number };

export type FlowLabel = "Big accumulation" | "Accumulation" | "Neutral" | "Distribution" | "Big distribution";

export type FlowSignal = {
  label: FlowLabel;
  /** (top-3 net buy − top-3 net sell) ÷ total value traded. */
  score: number;
  top3Buy: number;
  top3Sell: number;
  buyers: number;
  sellers: number;
};

export type UnusualActivity = {
  code: string;
  name: string;
  category: BrokerCategory;
  date: string;
  netValue: number;
  /** How many standard deviations above this broker's usual daily |net| in this stock. */
  zScore: number;
  usualAbsNet: number;
};

export type BrokerSummary = {
  symbol: string;
  start: string;
  end: string;
  dates: string[];
  sources: SourceSpan[];
  rows: BrokerRow[];
  totals: { value: number; volume: number; freq: number };
  categories: Record<BrokerCategory, { buy: number; sell: number; net: number }>;
  daily: DailyFlow[];
  signal: FlowSignal | null;
  unusual: UnusualActivity[];
  notes: string[];
};

export type BrokerPeriod = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y";

export const BROKER_PERIODS: BrokerPeriod[] = ["1D", "1W", "1M", "3M", "6M", "1Y"];

export type BrokerDrilldown = {
  symbol: string;
  code: string;
  name: string;
  category: BrokerCategory;
  days: {
    date: string;
    netVolume: number;
    netValue: number;
    buyAvg: number | null;
    sellAvg: number | null;
    cumVolume: number;
    /** Average cost of the running position since the start of the range, when it is net long. */
    avgCost: number | null;
    vwap: number | null;
  }[];
};

export type NewsArticle = {
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  thumbnail: string | null;
  symbols: string[];
  tags: string[];
  sector: string | null;
  sentiment: "bullish" | "bearish" | null;
};

export type NewsPage = {
  articles: NewsArticle[];
  total: number;
  nextOffset: number | null;
};

export type Position = {
  id: string;
  symbol: string;
  lots: number;
  avgPrice: number;
  openedAt: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type PortfolioSettings = { buyFeePct: number; sellFeePct: number };

export type ValuedPosition = Position & {
  name: string | null;
  sector: string | null;
  lastPrice: number | null;
  lastDate: string | null;
  prevClose: number | null;
  cost: number;
  marketValue: number | null;
  pnl: number | null;
  pnlPct: number | null;
  /** P&L after the estimated sell fee. */
  netPnl: number | null;
  dayChange: number | null;
  dayChangePct: number | null;
  weight: number | null;
  priceSource: PriceSource | null;
};

export type PortfolioSnapshot = {
  positions: ValuedPosition[];
  settings: PortfolioSettings;
  totals: {
    cost: number;
    marketValue: number;
    pnl: number;
    pnlPct: number | null;
    netPnl: number;
    dayChange: number;
    dayChangePct: number | null;
  };
  asOf: string | null;
  warnings: string[];
};

export type UniverseEntry = {
  symbol: string;
  name: string | null;
  sector: string | null;
  subSector: string | null;
  marketCap: number | null;
  lastPrice: number | null;
  change1d: number | null;
  peTtm: number | null;
  pbMrq: number | null;
  roeTtm: number | null;
  yieldTtm: number | null;
  /** Local data only: value traded over the last 30 days. */
  value30d?: number | null;
};

export type Universe = {
  source: "sectors" | "local";
  entries: UniverseEntry[];
  note?: string;
};

export type ServiceStatus = {
  sectors: boolean;
  openai: boolean;
  model: string;
  broksum: { ok: boolean; firstDate: string | null; lastDate: string | null; lastComplete: string; tickers: number; error?: string };
  credits: { today: number; date: string };
};
