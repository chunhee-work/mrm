import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { Brand } from "./brand-mark";
import LangSwitch from "./lang-switch";
import MobileMenu from "./mobile-menu";

/** Top bar of every public page. */
export default async function SiteNav({ authed }: { authed: boolean }) {
  const { t } = await getT();
  const links = [
    { href: "/#how", label: t("nav.how") },
    { href: "/#security", label: t("nav.security") },
    { href: "/#faq", label: t("nav.faq") },
    { href: "/contact", label: t("nav.contact") },
  ];
  const account = authed
    ? [{ href: "/dashboard", label: t("nav.myCases"), primary: true }]
    : [{ href: "/login", label: t("nav.login") }, { href: "/signup", label: t("nav.start"), primary: true }];
  return (
    <header className="sticky top-0 z-40 border-b border-hair bg-paper">
      <div className="wrap relative flex h-[60px] items-center justify-between gap-4 lg:h-16">
        <Link href="/" className="-my-2 flex items-center py-2" aria-label={t("nav.home")}>
          <Brand />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-8 lg:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-[15px] font-medium text-deep transition-colors hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1.5 lg:gap-5">
          <LangSwitch />
          <div className="hidden items-center gap-5 lg:flex">
            {authed ? (
              <Link href="/dashboard" className="btn-primary !h-10 !px-5">{t("nav.myCases")}</Link>
            ) : (
              <>
                <Link href="/login" className="text-[15px] font-medium text-deep transition-colors hover:text-ink">{t("nav.login")}</Link>
                <Link href="/signup" className="btn-primary !h-10 !px-5">{t("nav.start")}</Link>
              </>
            )}
          </div>
          <MobileMenu label={t("nav.menu")} items={[...links, ...account]} />
        </div>
      </div>
    </header>
  );
}
