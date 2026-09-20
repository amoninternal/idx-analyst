"use client";

import clsx from "clsx";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Activity, useState, type KeyboardEvent } from "react";
import type { CandleSeries } from "@/lib/types";
import { NewsFeed } from "../news/NewsFeed";
import { Notice } from "../ui";
import { BrokerPanel } from "./BrokerPanel";
import { ChartPanel } from "./ChartPanel";
import { FundamentalsPanel } from "./FundamentalsPanel";

const TABS = [
  { key: "chart", label: "Chart" },
  { key: "broker", label: "Broker summary" },
  { key: "fundamentals", label: "Fundamentals" },
  { key: "news", label: "News" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function StockTabs({ symbol, initial, hasSectors }: { symbol: string; initial: CandleSeries; hasSectors: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fromUrl = TABS.find((t) => t.key === params.get("tab"))?.key ?? "chart";
  const [tab, setTab] = useState<TabKey>(fromUrl);
  // Panels mount on first visit and keep their state (period, toggles) afterwards.
  const [visited, setVisited] = useState<Set<TabKey>>(() => new Set([fromUrl]));

  const select = (key: TabKey) => {
    setTab(key);
    setVisited((v) => (v.has(key) ? v : new Set(v).add(key)));
    const next = new URLSearchParams(params);
    if (key === "chart") next.delete("tab");
    else next.set("tab", key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.key === tab);
    if (e.key === "ArrowRight") select(TABS[(i + 1) % TABS.length].key);
    if (e.key === "ArrowLeft") select(TABS[(i - 1 + TABS.length) % TABS.length].key);
  };

  const panel = (key: TabKey) => {
    switch (key) {
      case "chart":
        return <ChartPanel symbol={symbol} initial={initial} />;
      case "broker":
        return <BrokerPanel symbol={symbol} />;
      case "fundamentals":
        return <FundamentalsPanel symbol={symbol} hasSectors={hasSectors} />;
      case "news":
        return hasSectors ? (
          <NewsFeed symbol={symbol} />
        ) : (
          <Notice title="News comes from the Sectors API">Add SECTORS_API_KEY to .env.local and restart the app to see news for {symbol}.</Notice>
        );
    }
  };

  return (
    <div className="mt-6">
      <div role="tablist" aria-label={`${symbol} views`} onKeyDown={onKeyDown} className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-rule">
        {TABS.map((t) => (
          <button
            key={t.key}
            id={`tab-${t.key}`}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            onClick={() => select(t.key)}
            className={clsx(
              "relative shrink-0 px-3 pt-1 pb-2.5 text-[15px] font-medium transition-colors",
              tab === t.key ? "text-ink" : "text-ink-3 hover:text-ink",
            )}
          >
            {t.label}
            {tab === t.key && <span aria-hidden className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-kunyit" />}
          </button>
        ))}
      </div>
      {TABS.filter((t) => visited.has(t.key)).map((t) => (
        <Activity key={t.key} mode={tab === t.key ? "visible" : "hidden"}>
          <div role="tabpanel" id={`panel-${t.key}`} aria-labelledby={`tab-${t.key}`}>
            {panel(t.key)}
          </div>
        </Activity>
      ))}
    </div>
  );
}
