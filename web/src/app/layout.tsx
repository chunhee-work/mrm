import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono, Saira } from "next/font/google";
import { getT } from "@/lib/i18n-server";
import { htmlLang, localeOf } from "@/lib/i18n";
import { SITE } from "@/lib/site";
import { LangProvider } from "@/components/lang-provider";

// Display: Saira (variable, with its width axis — set condensed). Body: Hanken Grotesk. Readouts: IBM Plex Mono.
// Chinese falls back to system CJK fonts (see tailwind.config.ts) — no CJK webfont is loaded.
const display = Saira({ subsets: ["latin"], axes: ["wdth"], variable: "--font-display", display: "swap" });
const sans = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const { lang, t } = await getT();
  const title = t("meta.title");
  const description = t("meta.desc");
  return {
    metadataBase: new URL(SITE.url),
    title: { default: title, template: `%s · ${SITE.brand}` },
    description,
    applicationName: SITE.brand,
    openGraph: { type: "website", siteName: SITE.brand, title, description, url: "/", locale: localeOf(lang).replace("-", "_") },
    twitter: { card: "summary_large_image", title, description },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = { themeColor: "#07090C", colorScheme: "dark" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang, t } = await getT();
  return (
    <html lang={htmlLang(lang)} className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-[3px] focus:bg-ice focus:px-4 focus:py-3 focus:text-[15px] focus:font-semibold focus:text-bay">
          {t("nav.skip")}
        </a>
        <LangProvider lang={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
