import Link from "next/link";

export default function StockNotFound() {
  return (
    <div className="max-w-xl py-16">
      <h1 className="text-2xl font-semibold">That stock isn&apos;t listed</h1>
      <p className="mt-2 text-ink-2">
        IDX tickers are four letters, like BBCA or TLKM. Search for the company by name from the bar at the top, or browse every listed
        stock.
      </p>
      <Link href="/stocks" className="mt-6 inline-flex h-9 items-center rounded bg-ink px-3.5 text-sm font-medium text-white hover:bg-[#23324f]">
        Browse all stocks
      </Link>
    </div>
  );
}
