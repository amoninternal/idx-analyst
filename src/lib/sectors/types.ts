// Response shapes of the Sectors v2 endpoints this app reads. Fields are
// optional because coverage differs by company and sector (banks, insurers,
// and miners each report different line items).

export type ReportSection =
  | "overview"
  | "valuation"
  | "future"
  | "peers"
  | "financials"
  | "dividend"
  | "management"
  | "ownership";

export const REPORT_SECTIONS: ReportSection[] = [
  "overview",
  "valuation",
  "future",
  "peers",
  "financials",
  "dividend",
  "management",
  "ownership",
];

type Num = number | null | undefined;

export type ReportOverview = {
  listing_board?: string;
  industry?: string;
  sub_industry?: string;
  sector?: string;
  sub_sector?: string;
  market_cap?: Num;
  market_cap_rank?: Num;
  address?: string;
  employee_num?: Num;
  listing_date?: string;
  website?: string;
  phone?: string;
  email?: string;
  last_close_price?: Num;
  latest_close_date?: string;
  daily_close_change?: Num;
  all_time_price?: Record<string, Record<string, number>>;
  esg_score?: Num;
  tags?: string[];
  indices?: string[];
  affiliates?: string[];
};

export type HistoricalValuation = {
  year: number;
  pe?: Num;
  pb?: Num;
  ps?: Num;
  pcf?: Num;
  peg?: Num;
  pe_peer_avg?: Num;
  pb_peer_avg?: Num;
  ps_peer_avg?: Num;
  enterprise_to_ebitda?: Num;
  enterprise_to_revenue?: Num;
};

export type ReportValuation = {
  last_close_price?: Num;
  latest_close_date?: string;
  forward_pe?: Num;
  intrinsic_value?: Num;
  historical_valuation?: HistoricalValuation[];
};

export type ReportFuture = {
  /** Estimates, plus one row of actuals for the base year (`financial_year`, `eps`, `total_revenue`). */
  company_value_forecasts?: {
    estimate_year?: number;
    eps_estimate?: Num;
    revenue_estimate?: Num;
    financial_year?: number;
    eps?: Num;
    total_revenue?: Num;
  }[];
  company_growth_forecasts?: { base_year?: number; estimate_year: number; eps_growth?: Num; revenue_growth?: Num }[];
  analyst_rating_breakdown?: {
    strong_buy?: Num;
    buy?: Num;
    hold?: Num;
    sell?: Num;
    strong_sell?: Num;
    n_analyst?: Num;
    updated_on?: string;
  } | null;
};

export type HistoricalFinancials = { year: number } & Record<string, number | null | undefined>;

export type HistoricalRatios = {
  year: string | number;
  capital?: Record<string, Num>;
  leverage?: Record<string, Num>;
  liquidity?: Record<string, Num>;
  efficiency?: Record<string, Num>;
  profitability?: Record<string, Num>;
};

export type ReportFinancials = {
  eps?: Num;
  historical_eps?: Record<string, { eps?: Num; eps_growth?: Num }>;
  historical_financials?: HistoricalFinancials[];
  historical_financial_ratio?: HistoricalRatios[];
  yoy_quarter_earnings_growth?: Num;
  yoy_quarter_revenue_growth?: Num;
};

export type ReportDividend = {
  historical_dividends?: Record<
    string,
    { breakdown?: { date: string; total: Num; yield?: Num }[]; total_yield?: Num; total_dividend?: Num }
  >;
  upcoming_dividends?: unknown;
  yield_ttm?: Num;
  dividend_yield_avg?: { period?: Num; avg_yield?: Num } | null;
  dividend_ttm?: Num;
  payout_ratio?: Num;
  cash_payout_ratio?: Num;
  last_ex_dividend_date?: string | null;
};

export type ReportManagement = {
  key_executives?: { name: string; position?: string }[];
  executives_shareholdings?: { name: string; position?: string; share_amount?: Num; share_percentage?: Num }[];
};

export type ReportOwnership = {
  major_shareholders?: { name: string; share_value?: Num; share_amount?: Num; share_percentage?: string | number | null }[];
  top_transactions?: {
    date?: string;
    top_buyers?: { name: string; changeAmount: number }[];
    top_sellers?: { name: string; changeAmount: number }[];
  } | null;
  institutional_transaction_flow?: { date: string; net_transaction: number }[];
  whale_investors?: string[];
  conglomerates_group?: string[];
};

export type PeerCompany = {
  symbol: string;
  company_name?: string;
  year?: number;
  group?: string[];
  market_cap?: Num;
  pe_ttm?: Num;
  pb_mrq?: Num;
  net_income?: Num;
  total_revenue?: Num;
  total_assets?: Num;
  total_equity?: Num;
  yearly_mcap_chg?: Num;
};

export type ReportPeers = {
  peers_data?: {
    companies?: PeerCompany[];
    group_name?: { sector?: string; industry?: string; sub_sector?: string; sub_industry?: string };
  };
}[];

export type CompanyReport = {
  symbol: string;
  company_name: string | null;
  overview?: ReportOverview;
  valuation?: ReportValuation;
  future?: ReportFuture;
  financials?: ReportFinancials;
  dividend?: ReportDividend;
  management?: ReportManagement;
  ownership?: ReportOwnership;
  peers?: ReportPeers;
};

export type QuarterlyFinancials = { date: string } & Record<string, unknown>;

export type Mover = {
  symbol: string;
  name: string;
  change: number;
  lastPrice: number;
  date: string;
};

export type MostTraded = { symbol: string; name: string; volume: number; price: number };

export type ForeignFlowDay = {
  date: string;
  netForeign: number;
  foreignBuy: number;
  foreignSell: number;
  foreignShare: number | null;
};

export type ForeignFlowLeader = { symbol: string; date: string; netForeign: number; foreignBuy: number; foreignSell: number };

export type IndexPoint = { time: string; value: number };

export type ScreenerResult = {
  rows: { symbol: string; name: string; values: Record<string, unknown> }[];
  total: number;
  translated: { where?: string; order_by?: string } | null;
  message: string | null;
};

export type Subsector = { sector: string; subSector: string };
