import { getUserOrNull } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { HOME } from "@/lib/home-copy";
import { pageMeta } from "@/lib/meta";
import { Closing, Security } from "@/components/landing/sections";

export const generateMetadata = () => pageMeta("nav.security", { desc: "meta.d.security" });

export default async function SecurityPage() {
  const me = await getUserOrNull();
  const { lang, t } = await getT();
  const c = HOME[lang];
  return (
    <>
      <Security c={c.security} page />
      <Closing c={c.closing} authed={!!me} labels={{ start: t("nav.start"), cases: t("nav.myCases") }} />
    </>
  );
}
