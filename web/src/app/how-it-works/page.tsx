import { getUserOrNull } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { HOME } from "@/lib/home-copy";
import { pageMeta } from "@/lib/meta";
import { Closing, Keyed, Steps } from "@/components/landing/sections";

export const generateMetadata = () => pageMeta("nav.how");

export default async function HowItWorks() {
  const me = await getUserOrNull();
  const { lang, t } = await getT();
  const c = HOME[lang];
  return (
    <>
      <Steps c={c.how} />
      <Keyed c={c.keyed} />
      <Closing c={c.closing} authed={!!me} labels={{ start: t("nav.start"), cases: t("nav.myCases") }} />
    </>
  );
}
