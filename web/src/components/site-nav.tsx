import Link from "next/link";
import { headers } from "next/headers";
import { getT } from "@/lib/i18n-server";
import { appOriginFor } from "@/lib/hosts";
import { Brand } from "./brand-mark";
import LangSwitch from "./lang-switch";
import MobileMenu from "./mobile-menu";

/** Top bar of every public page. `overlay`: laid over the page (the landing page's 3D stage starts at the very top). */
export default async function SiteNav({ authed, overlay = false }: { authed: boolean; overlay?: boolean }) {
  const { t } = await getT();
  // on the bare (marketing) domain the account pages are on the app host: link straight there
  const app = appOriginFor((await headers()).get("host"));
  // The bar carries only what a visitor acts on. Everything else is one scroll away or in the footer.
  const info = [
    { href: "/how-it-works", label: t("nav.how") },
    { href: "/security", label: t("nav.security") },
    { href: "/faq", label: t("nav.faq") },
  ];
  const links = [...info, { href: "/contact", label: t("nav.contact") }];
  const account = authed
    ? [{ href: `${app}/dashboard`, label: t("nav.myCases"), primary: true }]
    : [{ href: `${app}/login`, label: t("nav.login") }, { href: `${app}/signup`, label: t("nav.start"), primary: true }];
  return (
    <header className={`${overlay ? "fixed inset-x-0" : "sticky"} top-0 z-40 border-b border-hair/70 bg-bay/70 backdrop-blur-md`}>
      <div className="wrap relative flex h-[60px] items-center justify-between gap-2 sm:gap-4 lg:h-16">
        <Link href="/" className="-my-2 flex items-center py-2" aria-label={t("nav.home")}>
          <Brand />
        </Link>
        <div className="flex items-center gap-1.5 lg:gap-5">
          <LangSwitch />
          <div className="hidden items-center gap-5 lg:flex">
            {/* the three information pages sit in the bar where there is room for them; narrower, they are in the menu */}
            {info.map((l) => (
              <Link key={l.href} href={l.href} className="hidden text-[15px] font-medium text-mute transition-colors hover:text-fg xl:block">{l.label}</Link>
            ))}
            {authed ? (
              <Link href={`${app}/dashboard`} className="btn-primary !h-10 !px-5">{t("nav.myCases")}</Link>
            ) : (
              <>
                <Link href="/contact" className="text-[15px] font-medium text-mute transition-colors hover:text-fg">{t("nav.contact")}</Link>
                <Link href={`${app}/login`} className="text-[15px] font-medium text-fg transition-colors hover:text-ice">{t("nav.login")}</Link>
                <Link href={`${app}/signup`} className="btn-primary !h-10 !px-5">{t("nav.start")}</Link>
              </>
            )}
          </div>
          <MobileMenu label={t("nav.menu")} items={[...links, ...account]} />
        </div>
      </div>
    </header>
  );
}
