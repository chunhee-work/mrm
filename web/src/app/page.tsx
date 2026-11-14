import { getUserOrNull } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { HOME } from "@/lib/home-copy";
import { JOURNEY } from "@/lib/landing-copy";
import { SITE } from "@/lib/site";
import SiteNav from "@/components/site-nav";
import SiteFooter from "@/components/site-footer";
import WhatsAppFab from "@/components/whatsapp-fab";
import Journey from "@/components/landing/journey";
import { Closing, Faq, Keyed, Proof, Seam, Security } from "@/components/landing/sections";

// Still frames of the five stops, rendered from the same 3D scene (`node scripts/landing-posters.mjs`).
const POSTER = {
  desktop: [0, 1, 2, 3, 4].map((i) => `/landing/bay-${i}.jpg`),
  mobile: [0, 1, 2, 3, 4].map((i) => `/landing/bay-${i}-m.jpg`),
};

export default async function Home() {
  const me = await getUserOrNull();
  const { lang, t } = await getT();
  const c = HOME[lang];
  const authed = !!me;
  const labels = { start: t("nav.start"), cases: t("nav.myCases") };
  return (
    <>
      <SiteNav authed={authed} overlay />
      <main id="main">
        <Journey c={JOURNEY[lang]} cta={authed ? labels.cases : labels.start} href={authed ? "/dashboard" : "/signup"} poster={POSTER} />
        <Proof c={c.time} />
        <Seam />
        <Keyed c={c.keyed} />
        <Seam />
        <Security c={c.security} />
        <Seam />
        <Faq c={c.faq} />
        <Closing c={c.closing} authed={authed} labels={labels} />
      </main>
      <SiteFooter />
      <WhatsAppFab />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: SITE.brand,
            url: SITE.url,
            description: t("meta.desc"),
            inLanguage: ["en", "ms", "zh-CN"],
          }),
        }}
      />
    </>
  );
}
