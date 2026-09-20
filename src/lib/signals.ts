// The four one-line reads at the top of a stock page. Each is a rule of thumb
// computed from one feature (chart, broker flow, valuation, news) and says
// which numbers it used.

import { fmtIdr, fmtMultiple, parseWib } from "./format";
import type { TechnicalSnapshot } from "./indicators";
import type { CompanyReport } from "./sectors/types";
import type { BrokerSummary, NewsArticle } from "./types";

export type Tone = "positive" | "negative" | "neutral" | "unknown";

export type Lens = {
  key: "trend" | "flow" | "value" | "news";
  title: string;
  verdict: string;
  tone: Tone;
  detail: string;
  rule: string;
};

export function trendLens(snap: TechnicalSnapshot | null): Lens {
  const rule = "Price against its 50-day average, the 50-day against the 200-day, and the 50-day slope.";
  if (!snap || snap.sma50 === null) {
    return { key: "trend", title: "Trend", verdict: "Not enough history", tone: "unknown", detail: "Needs 50 trading days of prices.", rule };
  }
  const rsiText = snap.rsi14 !== null ? `RSI ${snap.rsi14.toFixed(0)}` : null;
  const detail = [snap.trendReasons[0], rsiText].filter(Boolean).join(", ");
  return {
    key: "trend",
    title: "Trend",
    verdict: snap.trend,
    tone: snap.trend === "Uptrend" ? "positive" : snap.trend === "Downtrend" ? "negative" : "neutral",
    detail,
    rule,
  };
}

export function flowLens(summary: BrokerSummary | null, periodLabel: string): Lens {
  const rule = "Top-3 net buyers against top-3 net sellers, relative to value traded, over the period.";
  if (!summary || !summary.signal) {
    return { key: "flow", title: "Broker flow", verdict: "No broker data", tone: "unknown", detail: "No trades in the selected range.", rule };
  }
  const { label } = summary.signal;
  const tone: Tone = /accumulation/i.test(label) ? "positive" : /distribution/i.test(label) ? "negative" : "neutral";
  return {
    key: "flow",
    title: "Broker flow",
    verdict: label,
    tone,
    detail: `Foreign net ${fmtIdr(summary.categories.foreign.net, { sign: true })} over ${periodLabel}`,
    rule,
  };
}

export function latestValuation(report: CompanyReport | null) {
  const rows = [...(report?.valuation?.historical_valuation ?? [])].sort((a, b) => b.year - a.year);
  return rows.find((r) => typeof r.pe === "number") ?? null;
}

export function valueLens(report: CompanyReport | null): Lens {
  const rule = "Latest-year P/E against the subsector peer average: below 85% is cheap, above 115% is rich.";
  const row = latestValuation(report);
  if (!row || typeof row.pe !== "number") {
    return { key: "value", title: "Valuation", verdict: "No valuation data", tone: "unknown", detail: "Needs the Sectors API.", rule };
  }
  if (row.pe <= 0) {
    return { key: "value", title: "Valuation", verdict: "Loss-making", tone: "negative", detail: `P/E ${fmtMultiple(row.pe)} (${row.year})`, rule };
  }
  const peer = typeof row.pe_peer_avg === "number" && row.pe_peer_avg > 0 ? row.pe_peer_avg : null;
  if (!peer) {
    return { key: "value", title: "Valuation", verdict: `P/E ${fmtMultiple(row.pe)}`, tone: "neutral", detail: `No peer average for ${row.year}`, rule };
  }
  const ratio = row.pe / peer;
  const verdict = ratio < 0.85 ? "Below peers" : ratio > 1.15 ? "Above peers" : "In line with peers";
  return {
    key: "value",
    title: "Valuation",
    verdict,
    tone: ratio < 0.85 ? "positive" : ratio > 1.15 ? "negative" : "neutral",
    detail: `P/E ${fmtMultiple(row.pe)} vs peers ${fmtMultiple(peer)} (${row.year})`,
    rule,
  };
}

export function newsLens(articles: NewsArticle[] | null, days = 30): Lens {
  const rule = `Articles tagged Bullish or Bearish by Sectors in the last ${days} days.`;
  if (!articles) {
    return { key: "news", title: "News", verdict: "No news data", tone: "unknown", detail: "Needs the Sectors API.", rule };
  }
  const since = Date.now() - days * 86_400_000;
  const recent = articles.filter((a) => parseWib(a.publishedAt) >= since);
  const bull = recent.filter((a) => a.sentiment === "bullish").length;
  const bear = recent.filter((a) => a.sentiment === "bearish").length;
  const detail = `${bull} bullish, ${bear} bearish of ${recent.length} articles in ${days} days`;
  if (recent.length < 2) return { key: "news", title: "News", verdict: "Quiet", tone: "neutral", detail, rule };
  if (bull >= 2 && bull >= bear * 2) return { key: "news", title: "News", verdict: "Mostly bullish", tone: "positive", detail, rule };
  if (bear >= 2 && bear >= bull * 2) return { key: "news", title: "News", verdict: "Mostly bearish", tone: "negative", detail, rule };
  return { key: "news", title: "News", verdict: "Mixed", tone: "neutral", detail, rule };
}
