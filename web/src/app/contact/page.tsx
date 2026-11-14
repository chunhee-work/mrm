import { getT } from "@/lib/i18n-server";
import { pageMeta } from "@/lib/meta";
import { SITE, showCompany, whatsappHref } from "@/lib/site";
import { Arrow } from "@/components/home/icons";

export const generateMetadata = () => pageMeta("contact.title");

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
  const cell = "group flex min-h-[220px] flex-col justify-between bg-white p-6 transition-colors hover:bg-inktint lg:min-h-[280px] lg:p-9";
  return (
    <div className="wrap pb-20 pt-12 lg:pb-28 lg:pt-20">
      <h1 className="display text-[clamp(2.6rem,7.4vw,5.5rem)] text-deep">{t("contact.title")}</h1>

      {company ? (
        <>
          {/* two ways in */}
          <div className="mt-10 grid gap-px border-[1.5px] border-ink bg-hair sm:grid-cols-2 lg:mt-14">
            <a href={whatsappHref()} target="_blank" rel="noopener noreferrer" className={cell}>
              <span className="flex items-start justify-between text-ink">
                <IconChat />
                <Arrow className="mt-1 transition-transform duration-200 group-hover:translate-x-1" />
              </span>
              <span>
                <span className="block text-[15px] font-medium text-mute">{t("contact.chat")}</span>
                <span className="display-2 num mt-2 block text-[clamp(1.5rem,3vw,2.4rem)] text-deep">{SITE.whatsapp}</span>
              </span>
            </a>
            <a href={`mailto:${SITE.email}`} className={cell}>
              <span className="flex items-start justify-between text-ink">
                <IconMail />
                <Arrow className="mt-1 transition-transform duration-200 group-hover:translate-x-1" />
              </span>
              <span>
                <span className="block text-[15px] font-medium text-mute">{t("contact.write")}</span>
                <span className="display-2 mt-2 block break-all text-[clamp(1.5rem,3vw,2.4rem)] text-deep">{SITE.email}</span>
              </span>
            </a>
          </div>

          {/* who you are talking to */}
          <address className="mt-8 grid gap-px border border-hair bg-hair text-[15px] not-italic leading-snug text-deep sm:grid-cols-2 lg:mt-10 lg:grid-cols-[1fr_1.5fr_0.9fr_1.2fr]">
            <div className="bg-white px-5 py-4 font-semibold">{SITE.legalName}</div>
            <div className="num bg-white px-5 py-4">{t("footer.reg")} {SITE.regNo}</div>
            <div className="bg-white px-5 py-4">{SITE.address}</div>
            <div className="bg-white px-5 py-4">{t("contact.hours")}</div>
          </address>
        </>
      ) : (
        <p className="mt-8 max-w-[40ch] text-[18px] leading-relaxed text-mute">{t("contact.soon")}</p>
      )}
    </div>
  );
}
