import { getT } from "@/lib/i18n-server";
import { pageMeta } from "@/lib/meta";
import { SITE, showCompany, whatsappHref } from "@/lib/site";
import { Arrow } from "@/components/icons";
import ScanEdge from "@/components/scan-edge";

export const generateMetadata = () => pageMeta("contact.title", { desc: "meta.d.contact" });

function IconChat() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M5.25 33.75l2.2-7.1A14.75 14.75 0 1 1 13 32.2z" />
      <path d="M14.5 14.25c0 6 5.25 11.25 11.25 11.25l1.5-3.5-4-2-1.75 1.75c-1.75-.75-3.5-2.5-4.25-4.25L19 15.75l-2-4z" />
    </svg>
  );
}
function IconMail() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M3.75 8.75h32.5v22.5H3.75z" />
      <path d="M3.75 8.75L20 22.5 36.25 8.75" />
    </svg>
  );
}

export default async function Contact() {
  const { t } = await getT();
  const company = showCompany();
  const mailCell = "group flex min-h-[150px] flex-col justify-between gap-6 bg-panel p-6 transition-colors hover:bg-panel2 lg:p-9";
  return (
    <div className="wrap pb-20 pt-12 lg:pb-28 lg:pt-20">
      <h1 className="display text-[clamp(2.6rem,7.4vw,5.5rem)] text-fg">{t("contact.title")}</h1>
      <p className="mt-5 max-w-[52ch] text-[17px] leading-relaxed text-mute lg:mt-7 lg:text-[19px]">{t("contact.sub")}</p>

      {/* ways in: WhatsApp always; email once the company details are real */}
      <div className={`relative mt-9 grid gap-px overflow-hidden rounded-[3px] border border-hair bg-hair lg:mt-12 ${company ? "lg:grid-cols-[1.6fr_1fr]" : ""}`}>
        <ScanEdge />
        {/* the whole block is the link; the button inside it is what says "press here" */}
        <a href={whatsappHref(t("wa.msg"))} target="_blank" rel="noopener noreferrer" className="group flex flex-col gap-7 bg-panel p-6 transition-colors hover:bg-panel2 sm:flex-row sm:items-center sm:justify-between lg:p-9">
          <span className="flex items-center gap-5">
            <span className="shrink-0 text-ice"><IconChat /></span>
            <span>
              <span className="block text-[15px] font-medium text-mute">{t("contact.chat")}</span>
              <span className="display-2 num mt-1.5 block whitespace-nowrap text-[clamp(1.7rem,3.4vw,2.8rem)] text-fg">{SITE.whatsapp}</span>
            </span>
          </span>
          <span className="btn-primary w-full shrink-0 sm:w-auto">
            {t("contact.open")}
            <Arrow className="transition-transform duration-200 group-hover:translate-x-1" />
          </span>
        </a>
        {company && (
          <a href={`mailto:${SITE.email}`} className={mailCell}>
            <span className="flex items-start justify-between text-ice">
              <IconMail />
              <Arrow className="mt-1 transition-transform duration-200 group-hover:translate-x-1" />
            </span>
            <span>
              <span className="block text-[15px] font-medium text-mute">{t("contact.write")}</span>
              <span className="mt-1.5 block break-all text-[19px] font-medium text-fg">{SITE.email}</span>
            </span>
          </a>
        )}
      </div>

      {/* when someone answers */}
      <dl className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[15px] leading-snug">
        <dt className="note text-mute">{t("contact.hoursLabel")}</dt>
        <dd className="text-fg">{t("contact.hours")}</dd>
      </dl>

      {/* who you are talking to */}
      {company && (
        <address className="mt-8 grid gap-px overflow-hidden rounded-[3px] border border-hair bg-hair text-[15px] not-italic leading-snug text-fg sm:grid-cols-3 lg:mt-10 lg:grid-cols-[1fr_1.5fr_0.9fr]">
          <div className="bg-panel px-5 py-4 font-semibold">{SITE.legalName}</div>
          <div className="num bg-panel px-5 py-4">{t("footer.reg")} {SITE.regNo}</div>
          <div className="bg-panel px-5 py-4">{SITE.address}</div>
        </address>
      )}
    </div>
  );
}
