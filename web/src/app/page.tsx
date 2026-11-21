import { headers } from "next/headers";
import { getUserOrNull } from "@/lib/session";
import { appOriginFor } from "@/lib/hosts";
import { getT } from "@/lib/i18n-server";
import { HOME } from "@/lib/home-copy";
import { honestCopy } from "@/lib/honest-copy";
import { envOn } from "@/lib/ext/gate";
import { workerUiOn } from "@/lib/ext/worker-gate";
import { JOURNEY } from "@/lib/landing-copy";
import { SITE } from "@/lib/site";
import SiteNav from "@/components/site-nav";
import SiteFooter from "@/components/site-footer";
import WhatsAppFab from "@/components/whatsapp-fab";
import Journey from "@/components/landing/journey";
import { More, Proof } from "@/components/landing/sections";

// Still frames of the five stops, rendered from the same 3D scene (`node scripts/landing-posters.mjs`).
const POSTER = {
  desktop: [0, 1, 2, 3, 4].map((i) => `/landing/bay-${i}.jpg`),
  mobile: [0, 1, 2, 3, 4].map((i) => `/landing/bay-${i}-m.jpg`),
};

export default async function Home() {
  const me = await getUserOrNull();
  const { lang, t } = await getT();
  const c = honestCopy(HOME[lang], lang, workerUiOn(), !envOn());
  const authed = !!me;
  const app = appOriginFor((await headers()).get("host")); // "" on the app host: the links stay inside the site
  const labels = { start: t("nav.start"), cases: t("nav.myCases") };
  return (
    <>
      <SiteNav authed={authed} overlay />
      <main id="main">
        <Journey c={JOURNEY[lang]} cta={authed ? labels.cases : labels.start} href={app + (authed ? "/dashboard" : "/signup")} poster={POSTER} />
        {/* the detail lives on pages of its own (How it works, Security, FAQ): this page stays short */}
        <Proof c={c.time} />
        <More c={c} label={t("nav.more")} />
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
