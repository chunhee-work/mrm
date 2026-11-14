import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { SITE, showCompany, whatsappHref } from "@/lib/site";
import { Brand } from "./brand-mark";

/** Malaysian business footer. The identity block reads from `lib/site.ts`. */
export default async function SiteFooter() {
  const { t } = await getT();
  const company = showCompany();
  const links = [
    { href: "/privacy", label: t("footer.privacy") },
    { href: "/terms", label: t("footer.terms") },
    { href: "/contact", label: t("footer.contact") },
  ];
  const cell = "bg-panel px-4 py-3.5";
  return (
    <footer className="bg-bay">
      <div className="wrap pb-10 pt-14 lg:pt-20">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/" aria-label={t("nav.home")} className="self-start"><Brand /></Link>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-8">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="flex h-11 items-center text-[15px] font-medium text-fg transition-colors hover:text-ice">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* company identity (Companies Act 2016 s.30) — drawn as the title block of the sheet */}
        {company && (
          <address className="mt-8 grid gap-px border border-hair bg-hair text-[14px] not-italic leading-snug text-fg sm:grid-cols-2 lg:grid-cols-[1.15fr_1.6fr_1fr_1fr_1.25fr]">
            <div className={`${cell} font-semibold`}>{SITE.legalName}</div>
            <div className={`${cell} num`}>{t("footer.reg")} {SITE.regNo}</div>
            <div className={cell}>{SITE.address}</div>
            <a className={`${cell} transition-colors hover:text-ice`} href={`mailto:${SITE.email}`}>{SITE.email}</a>
            <a className={`${cell} num transition-colors hover:text-ice whitespace-nowrap sm:col-span-2 lg:col-span-1`} href={whatsappHref()}>
              WhatsApp {SITE.whatsapp}
            </a>
          </address>
        )}

        <div className="mt-6 flex flex-col gap-3 text-[13px] leading-relaxed text-mute lg:flex-row lg:justify-between lg:gap-10">
          <p className="max-w-[72ch]">{t("footer.disclaimer")}</p>
          <p className="num shrink-0">© {SITE.year} {company ? SITE.legalName : SITE.brand}</p>
        </div>
      </div>
    </footer>
  );
}
