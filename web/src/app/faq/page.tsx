import { getUserOrNull } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { HOME } from "@/lib/home-copy";
import { honestCopy } from "@/lib/honest-copy";
import { envOn } from "@/lib/ext/gate";
import { workerUiOn } from "@/lib/ext/worker-gate";
import { pageMeta } from "@/lib/meta";
import { Closing, Faq } from "@/components/landing/sections";

export const generateMetadata = () => pageMeta("nav.faq", { desc: "meta.d.faq" });

export default async function FaqPage() {
  const me = await getUserOrNull();
  const { lang, t } = await getT();
  const c = honestCopy(HOME[lang], lang, workerUiOn(), !envOn());
  return (
    <>
      <Faq c={c.faq} page />
      <Closing c={c.closing} authed={!!me} labels={{ start: t("nav.start"), cases: t("nav.myCases") }} />
    </>
  );
}
