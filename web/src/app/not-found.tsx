import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { getUserOrNull } from "@/lib/session";
import SiteNav from "@/components/site-nav";
import SiteFooter from "@/components/site-footer";
import { Arrow } from "@/components/icons";
import ScanEdge from "@/components/scan-edge";
import WhatsAppFab from "@/components/whatsapp-fab";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("nf.meta"), robots: { index: false, follow: false } };
}

export default async function NotFound() {
  const [{ t }, me] = await Promise.all([getT(), getUserOrNull()]);
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav authed={!!me} />
      <main id="main" className="wrap flex flex-1 flex-col justify-center py-16 lg:py-24">
        {/* an empty bay: the light is on, nothing is parked in it */}
        <div className="relative overflow-hidden rounded-[3px] border border-hair bg-panel px-6 py-14 sm:px-12 lg:px-16 lg:py-24">
          <ScanEdge />
          <div className="pointer-events-none absolute inset-0" aria-hidden="true" style={{ backgroundImage: "radial-gradient(50% 80% at 30% 0%, rgba(191,233,255,0.13), transparent 70%)" }} />
          <p aria-hidden="true" className="display num relative text-[clamp(5.5rem,20vw,15rem)] leading-[0.8] text-ice">404</p>
          <h1 className="display-2 relative mt-8 text-[clamp(1.75rem,3.4vw,2.75rem)] text-fg lg:mt-12">{t("nf.title")}</h1>
          <p className="relative mt-4 max-w-[46ch] text-[17px] leading-relaxed text-mute">{t("nf.sub")}</p>
          <div className="relative mt-8 flex flex-wrap items-center gap-x-8 gap-y-3">
            <Link href="/" className="btn-primary">
              {t("nf.home")}
              <Arrow />
            </Link>
            {me ? <Link href="/dashboard" className="btn-quiet">{t("nf.cases")}</Link> : <Link href="/contact" className="btn-quiet">{t("nav.contact")}</Link>}
          </div>
        </div>
      </main>
      <div className="wrap"><div className="reg-rule" /></div>
      <SiteFooter />
      <WhatsAppFab />
    </div>
  );
}
