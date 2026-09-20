"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWRInfinite from "swr/infinite";
import { swrFetcher } from "@/lib/fetcher";
import { fmtTimeAgo } from "@/lib/format";
import type { NewsArticle, NewsPage } from "@/lib/types";
import { Button, Segmented, Spinner } from "../controls";
import { Notice } from "../ui";

type Sentiment = "All" | "Bullish" | "Bearish";

export function NewsItem({ article, currentSymbol }: { article: NewsArticle; currentSymbol?: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = article.summary.length > 280;
  return (
    <article className="flex gap-4 py-4">
      {article.thumbnail && (
        // Thumbnails come from many news sites; a plain img avoids an image-domain allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={article.thumbnail} alt="" loading="lazy" className="hidden h-[72px] w-28 shrink-0 rounded object-cover sm:block" />
      )}
      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] leading-snug font-semibold">
          <a href={article.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {article.title}
          </a>
        </h3>
        {article.summary && (
          <p className={clsx("mt-1 max-w-3xl font-serif text-[15px] leading-relaxed text-ink-2", !expanded && long && "line-clamp-3")}>{article.summary}</p>
        )}
        {long && (
          <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-1 text-xs text-ink-3 hover:text-ink">
            {expanded ? "Show less" : "Read the full summary"}
          </button>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
          <span>{article.source}</span>
          <time dateTime={article.publishedAt}>{fmtTimeAgo(article.publishedAt)}</time>
          {article.sentiment && (
            <span className="inline-flex items-center gap-1 text-ink-2">
              <span aria-hidden className={article.sentiment === "bullish" ? "text-up" : "text-down"}>
                {article.sentiment === "bullish" ? "▲" : "▼"}
              </span>
              {article.sentiment === "bullish" ? "Bullish" : "Bearish"}
            </span>
          )}
          {article.symbols
            .filter((s) => s !== currentSymbol)
            .slice(0, 6)
            .map((s) => (
              <Link key={s} href={`/stocks/${s}`} className="condensed rounded border border-rule px-1.5 font-bold text-ink-2 hover:border-rule-strong hover:text-ink">
                {s}
              </Link>
            ))}
        </div>
      </div>
    </article>
  );
}

/** News list with sentiment and keyword filters, loading 20 at a time. */
export function NewsFeed({ symbol, showSearch = false }: { symbol?: string; showSearch?: boolean }) {
  const [sentiment, setSentiment] = useState<Sentiment>("All");
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setKeyword(keywordInput.trim()), 400);
    return () => clearTimeout(t);
  }, [keywordInput]);

  const getKey = (index: number, previous: NewsPage | null) => {
    if (previous && previous.nextOffset === null) return null;
    const params = new URLSearchParams({ limit: "20", offset: String(previous?.nextOffset ?? index * 20) });
    if (symbol) params.set("symbol", symbol);
    if (sentiment !== "All") params.set("tags", sentiment);
    if (keyword) params.set("keyword", keyword);
    return `/api/news?${params}`;
  };
  const { data, error, size, setSize, isLoading, isValidating } = useSWRInfinite<NewsPage>(getKey, swrFetcher, {
    revalidateFirstPage: false,
    revalidateOnFocus: false,
  });

  const articles = data?.flatMap((p) => p.articles) ?? [];
  const total = data?.[0]?.total ?? 0;
  const hasMore = data ? data.at(-1)?.nextOffset !== null : false;
  const loadingMore = isValidating && size > (data?.length ?? 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Sentiment" options={["All", "Bullish", "Bearish"] as const} value={sentiment} onChange={setSentiment} />
        {showSearch && (
          <input
            type="search"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder="Filter headlines, e.g. dividend"
            aria-label="Filter headlines by keyword"
            className="h-9 w-full max-w-xs rounded border border-rule-strong bg-sheet px-3 text-sm placeholder:text-ink-3 focus:border-ink focus:outline-none"
          />
        )}
        {data && <span className="text-[13px] text-ink-3 tnum">{total.toLocaleString("en-US")} articles</span>}
      </div>

      {error && !data ? (
        <Notice tone="error" className="mt-4" title="News is unavailable">
          {error.message}
        </Notice>
      ) : isLoading ? (
        <div className="py-6">
          <Spinner label="Loading news" />
        </div>
      ) : articles.length === 0 ? (
        <p className="py-6 text-[13px] text-ink-3">
          No articles{symbol ? ` tagged ${symbol}` : ""}
          {sentiment !== "All" ? ` marked ${sentiment.toLowerCase()}` : ""}
          {keyword ? ` matching "${keyword}"` : ""}.
        </p>
      ) : (
        <div className="mt-2 divide-y divide-rule">
          {articles.map((a) => (
            <NewsItem key={`${a.url}-${a.publishedAt}`} article={a} currentSymbol={symbol} />
          ))}
        </div>
      )}

      {hasMore && articles.length > 0 && (
        <div className="mt-2">
          <Button onClick={() => setSize(size + 1)} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load 20 more"}
          </Button>
        </div>
      )}
      {articles.length > 0 && <p className="mt-4 text-xs text-ink-3">News and sentiment tags from the Sectors API. Each page of 20 uses one credit.</p>}
    </div>
  );
}
