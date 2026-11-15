import { getUserOrNull } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { HOME } from "@/lib/home-copy";
import { pageMeta } from "@/lib/meta";
import { Closing, Faq } from "@/components/landing/sections";

export const generateMetadata = () => pageMeta("nav.faq");

export default async function FaqPage() {
  const me = await getUserOrNull();
  const { lang, t } = await getT();
  const c = HOME[lang];
  return (
    <>
      <Faq c={c.faq} page />
      <Closing c={c.closing} authed={!!me} labels={{ start: t("nav.start"), cases: t("nav.myCases") }} />
    </>
  );
}
