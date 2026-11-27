import { getUserOrNull } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { HOME } from "@/lib/home-copy";
import { honestCopy } from "@/lib/honest-copy";
import { envOn } from "@/lib/ext/gate";
import { savedLoginOn } from "@/lib/ext/worker-gate";
import { pageMeta } from "@/lib/meta";
import { Closing, Keyed, Steps } from "@/components/landing/sections";
import Guide from "./guide";

export const generateMetadata = () => pageMeta("nav.how", { desc: "meta.d.how" });

export default async function HowItWorks() {
  const me = await getUserOrNull();
  const { lang, t } = await getT();
  if (me) return <Guide lang={lang} authed />; // signed in: the app's own white page; signed out: the public one below
  const c = honestCopy(HOME[lang], lang, savedLoginOn(), !envOn());
  return (
    <>
      <Steps c={c.how} />
      <Keyed c={c.keyed} />
      <Closing c={c.closing} authed={!!me} labels={{ start: t("nav.start"), cases: t("nav.myCases") }} />
    </>
  );
}
