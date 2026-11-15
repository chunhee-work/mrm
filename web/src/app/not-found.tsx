import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { getUserOrNull } from "@/lib/session";
import SiteNav from "@/components/site-nav";
import SiteFooter from "@/components/site-footer";
import { Arrow } from "@/components/icons";
import ScanEdge from "@/components/scan-edge";
import WhatsAppFab from "@/components/whatsapp-fab";

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
          <Link href="/" className="btn-primary relative mt-8">
            {t("nf.home")}
            <Arrow />
          </Link>
        </div>
      </main>
      <div className="wrap"><div className="reg-rule" /></div>
      <SiteFooter />
      <WhatsAppFab />
    </div>
  );
}
