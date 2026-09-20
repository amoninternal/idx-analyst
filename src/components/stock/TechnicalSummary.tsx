import clsx from "clsx";
import type { ReactNode } from "react";
import { fmtCompact, fmtDecimal, fmtPct, fmtPrice } from "@/lib/format";
import type { TechnicalSnapshot } from "@/lib/indicators";
import type { PriceSource } from "@/lib/types";
import { TONE_GLYPH } from "../ui";

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-ink-2">{label}</dt>
      <dd className="text-right tnum">
        {children}
        {hint && <span className="ml-1.5 text-ink-3">{hint}</span>}
      </dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-rule pt-3">
      <h3 className="mb-1 text-[13px] font-semibold">{title}</h3>
      <dl className="text-[13px]">{children}</dl>
    </div>
  );
}

function rsiZone(v: number | null) {
  if (v === null) return undefined;
  if (v >= 70) return "overbought";
  if (v <= 30) return "oversold";
  return v >= 50 ? "bullish half" : "bearish half";
}

export function TechnicalSummary({ snapshot, source }: { snapshot: TechnicalSnapshot | null; source: PriceSource }) {
  if (!snapshot) return <p className="text-[13px] text-ink-3">Not enough price history for indicators.</p>;
  const s = snapshot;
  const tone = s.trend === "Uptrend" ? TONE_GLYPH.positive : s.trend === "Downtrend" ? TONE_GLYPH.negative : TONE_GLYPH.neutral;
  const ohlc = source === "sectors";
  const vsAverage = (avg: number | null) => (avg ? fmtPct(s.close / avg - 1, { sign: true, digits: 1 }) : undefined);

  return (
    <aside className="space-y-3" aria-label="Technical summary">
      <div>
        <div className="text-[13px] text-ink-3">Trend on {s.bars} daily bars</div>
        <div className="mt-1 flex items-baseline gap-2 text-xl font-semibold">
          <span aria-hidden className={clsx("text-[0.65em]", tone.color)}>
            {tone.glyph}
          </span>
          {s.trend}
        </div>
        <ul className="mt-1.5 space-y-0.5 text-[13px] text-ink-2">
          {s.trendReasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>

      {s.observations.length > 0 && (
        <Group title="Worth noticing">
          <ul className="space-y-1 text-ink-2">
            {s.observations.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </Group>
      )}

      <Group title="Moving averages">
        <Row label="MA 20" hint={vsAverage(s.sma20)}>
          {fmtPrice(s.sma20)}
        </Row>
        <Row label="MA 50" hint={vsAverage(s.sma50)}>
          {fmtPrice(s.sma50)}
        </Row>
        <Row label="MA 200" hint={vsAverage(s.sma200)}>
          {fmtPrice(s.sma200)}
        </Row>
      </Group>

      <Group title="Momentum">
        <Row label="RSI 14" hint={rsiZone(s.rsi14)}>
          {fmtDecimal(s.rsi14, 1)}
        </Row>
        <Row label="MACD" hint={s.macd ? (s.macd.hist >= 0 ? "above signal" : "below signal") : undefined}>
          {s.macd ? fmtDecimal(s.macd.line, 1) : "—"}
        </Row>
        {ohlc && (
          <Row label="Stochastic %K" hint={s.stochastic ? (s.stochastic.k >= 80 ? "high" : s.stochastic.k <= 20 ? "low" : undefined) : undefined}>
            {fmtDecimal(s.stochastic?.k, 1)}
          </Row>
        )}
      </Group>

      <Group title="Volatility and volume">
        {ohlc && (
          <Row label="ATR 14" hint={s.atr14 ? fmtPct(s.atr14 / s.close, { digits: 1 }) : undefined}>
            {fmtPrice(s.atr14)}
          </Row>
        )}
        <Row label="Bollinger %B" hint={s.bollinger ? (s.bollinger.percentB > 1 ? "above band" : s.bollinger.percentB < 0 ? "below band" : undefined) : undefined}>
          {s.bollinger ? fmtDecimal(s.bollinger.percentB, 2) : "—"}
        </Row>
        <Row label="Volume" hint={s.volumeRatio ? `${s.volumeRatio.toFixed(1)}× 20-day avg` : undefined}>
          {fmtCompact(s.volume / 100)} lots
        </Row>
      </Group>

      <Group title="Levels">
        <Row label="Resistance">{s.resistances.length ? s.resistances.map(fmtPrice).join(", ") : "none above"}</Row>
        <Row label="Support">{s.supports.length ? s.supports.map(fmtPrice).join(", ") : "none below"}</Row>
        {ohlc && (
          <Row label="Pivot" hint={`R1 ${fmtPrice(s.pivots.r1)}, S1 ${fmtPrice(s.pivots.s1)}`}>
            {fmtPrice(s.pivots.p)}
          </Row>
        )}
        <Row label="52-week range">
          {fmtPrice(s.low52w)} to {fmtPrice(s.high52w)}
        </Row>
      </Group>

      <Group title="Returns">
        <div className="grid grid-cols-4 gap-2 py-1.5 text-center">
          {(
            [
              ["1W", s.returns.d5],
              ["1M", s.returns.d20],
              ["3M", s.returns.d60],
              ["1Y", s.returns.d250],
            ] as const
          ).map(([label, v]) => (
            <div key={label}>
              <div className="text-xs text-ink-3">{label}</div>
              <div className={clsx("tnum font-medium", v === null ? "text-ink-3" : v > 0 ? "text-up" : v < 0 ? "text-down" : "")}>
                {fmtPct(v, { sign: true, digits: 1 })}
              </div>
            </div>
          ))}
        </div>
      </Group>

      <p className="border-t border-rule pt-3 text-xs text-ink-3">
        Levels snap to IDX tick sizes. Signals are rules of thumb computed from daily {ohlc ? "candles" : "average prices"}, not advice.
      </p>
    </aside>
  );
}
