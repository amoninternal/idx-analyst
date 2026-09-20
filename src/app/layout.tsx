import type { Metadata } from "next";
import { Archivo, Source_Serif_4 } from "next/font/google";
import { AnalystDrawer } from "@/components/analyst/AnalystDrawer";
import { AnalystProvider } from "@/components/analyst/AnalystProvider";
import { Board } from "@/components/board/Board";
import { SiteFooter } from "@/components/SiteFooter";
import { Suspense } from "react";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "IDX Analyst", template: "%s | IDX Analyst" },
  description: "Charts, broker flow, fundamentals, news and an AI analyst for stocks on the Indonesia Stock Exchange.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} ${sourceSerif.variable}`}>
      <body className="min-h-dvh">
        <AnalystProvider>
          <Board />
          <main className="mx-auto w-full max-w-[1440px] px-4 pt-6 pb-20 sm:px-6">{children}</main>
          <Suspense>
            <SiteFooter />
          </Suspense>
          <AnalystDrawer />
        </AnalystProvider>
      </body>
    </html>
  );
}
