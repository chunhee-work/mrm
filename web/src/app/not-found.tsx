import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { getUserOrNull } from "@/lib/session";
import SiteNav from "@/components/site-nav";
import SiteFooter from "@/components/site-footer";
import { Arrow } from "@/components/home/icons";

export default async function NotFound() {
  const [{ t }, me] = await Promise.all([getT(), getUserOrNull()]);
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav authed={!!me} />
      <main id="main" className="wrap flex flex-1 flex-col justify-center py-16 lg:py-24">
        {/* an empty sheet: only the crop marks and the page number are left */}
        <div className="relative border border-dashed border-ink px-6 py-14 sm:px-12 lg:px-16 lg:py-24">
          {["-left-px -top-px", "-right-px -top-px -scale-x-100", "-bottom-px -left-px -scale-y-100", "-bottom-px -right-px -scale-100"].map((pos) => (
            <svg key={pos} aria-hidden="true" viewBox="0 0 21 21" fill="none" stroke="#1838A8" strokeWidth="1.5" className={`absolute h-[21px] w-[21px] bg-paper ${pos}`}>
              <path d="M.75 21V.75H21" />
            </svg>
          ))}
          <p aria-hidden="true" className="display num text-[clamp(5.5rem,20vw,15rem)] leading-[0.8] text-ink">404</p>
          <h1 className="display-2 mt-8 text-[clamp(1.75rem,3.4vw,2.75rem)] text-deep lg:mt-12">{t("nf.title")}</h1>
          <Link href="/" className="btn-primary mt-8">
            {t("nf.home")}
            <Arrow />
          </Link>
        </div>
      </main>
      <div className="wrap"><div className="reg-rule" /></div>
      <SiteFooter />
    </div>
  );
}
