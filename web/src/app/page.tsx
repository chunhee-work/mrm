import { getUserOrNull } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { HOME } from "@/lib/home-copy";
import { SITE } from "@/lib/site";
import SiteNav from "@/components/site-nav";
import SiteFooter from "@/components/site-footer";
import { Closing, Faq, Hero, How, Keyed, Rule, Security, Time } from "@/components/home/sections";

const STATUSES = ["uploaded", "reading", "naming", "phase_a", "waiting_user", "phase_b", "checking", "done"];

export default async function Home() {
  const me = await getUserOrNull();
  const { lang, t } = await getT();
  const c = HOME[lang];
  const authed = !!me;
  const labels = { start: t("nav.start"), cases: t("nav.myCases") };
  return (
    <>
      <SiteNav authed={authed} />
      <main id="main">
        <Hero c={c} authed={authed} labels={labels} statuses={STATUSES.map((s) => t(`status.${s}`))} />
        <Rule />
        <Time c={c.time} />
        <Rule />
        <How c={c.how} done={t("status.done")} checking={t("status.checking")} />
        <Keyed c={c.keyed} />
        <Rule />
        <Security c={c.security} />
        <Rule />
        <Faq c={c.faq} />
        <Closing c={c.closing} authed={authed} labels={labels} />
      </main>
      <SiteFooter />
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
