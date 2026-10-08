import type { Metadata } from "next";
import { Archivo, Source_Serif_4 } from "next/font/google";
import { cookies } from "next/headers";
import { AnalystDrawer } from "@/components/analyst/AnalystDrawer";
import { AnalystProvider } from "@/components/analyst/AnalystProvider";
import { Board } from "@/components/board/Board";
import { SiteFooter } from "@/components/SiteFooter";
import { ThemeProvider } from "@/components/ThemeProvider";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en" data-theme={theme} className={`${archivo.variable} ${sourceSerif.variable}`}>
      <body className="min-h-dvh">
        <ThemeProvider initial={theme}>
          <AnalystProvider>
            <Board />
            <main className="mx-auto w-full max-w-[1440px] px-4 pt-6 pb-20 sm:px-6">{children}</main>
            <Suspense>
              <SiteFooter />
            </Suspense>
            <AnalystDrawer />
          </AnalystProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
