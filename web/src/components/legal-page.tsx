import { getT } from "@/lib/i18n-server";
import { localeOf } from "@/lib/i18n";
import { LEGAL_UPDATED, fillLegal, type LegalDoc } from "@/lib/legal";
import { SITE, contactEmail, operatorName } from "@/lib/site";

/** Privacy Notice / Terms of Service: numbered contents on the left, the text on the right. */
export default async function LegalPage({ docs }: { docs: Record<string, LegalDoc> }) {
  const { lang, t } = await getT();
  const doc = docs[lang];
  const f = (s: string) => fillLegal(s, { brand: SITE.brand, operator: operatorName(), email: contactEmail() });
  const date = new Intl.DateTimeFormat(localeOf(lang), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(LEGAL_UPDATED));
  const toc = (
    <ol className="grid">
      {doc.sections.map((s, i) => (
        <li key={s.h}>
          <a href={`#s${i + 1}`} className="group flex min-h-[40px] items-baseline gap-3 py-2 text-[15px] leading-snug text-mute transition-colors hover:text-ice">
            <span className="note w-5 shrink-0 text-ice">{i + 1}</span>
            <span className="underline decoration-transparent decoration-1 underline-offset-4 transition-colors group-hover:decoration-ice">{f(s.h)}</span>
          </a>
        </li>
      ))}
    </ol>
  );
  return (
    <article className="wrap pb-20 pt-12 lg:pb-28 lg:pt-20">
      <header className="border-b border-ice pb-8 lg:pb-12">
        <h1 className="display text-[clamp(2.4rem,6.4vw,4.75rem)] text-fg">{doc.title}</h1>
        <p className="note mt-5 text-mute lg:mt-7">
          {t("legal.updated")} <time dateTime={LEGAL_UPDATED} className="text-fg">{date}</time>
        </p>
      </header>

      <div className="grid gap-y-8 pt-8 lg:grid-cols-12 lg:gap-x-12 lg:pt-12">
        <nav aria-label={t("legal.contents")} className="lg:col-span-4">
          <details className="faq border-y border-hair lg:hidden">
            <summary className="flex min-h-[52px] items-center justify-between text-[16px] font-semibold text-fg">
              {t("legal.contents")}
              <svg className="text-ice" width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M1 9h16" />
                <path className="pm-v" d="M9 1v16" />
              </svg>
            </summary>
            <div className="pb-3">{toc}</div>
          </details>
          <div className="sticky top-24 hidden max-h-[calc(100dvh-7.5rem)] overflow-y-auto pr-2 lg:block">{toc}</div>
        </nav>

        <div className="max-w-[68ch] lg:col-span-8">
          {doc.intro.map((p) => (
            <p key={p} className="text-[18px] leading-relaxed text-fg lg:text-[19px]">{f(p)}</p>
          ))}
          <p className="mt-5 border-l-2 border-ice pl-4 text-[15px] leading-relaxed text-mute">{f(doc.note)}</p>

          {doc.sections.map((s, i) => (
            <section key={s.h} id={`s${i + 1}`} aria-labelledby={`s${i + 1}-h`} className="mt-10 border-t border-hair pt-8 lg:mt-12 lg:pt-10">
              <h2 id={`s${i + 1}-h`} className="display-3 flex items-baseline gap-3 text-[22px] text-fg lg:text-[25px]">
                <span className="note w-5 shrink-0 text-[13px] text-ice">{i + 1}</span>
                {f(s.h)}
              </h2>
              <div className="mt-4 grid gap-3.5 pl-8 text-[16px] leading-relaxed text-fg lg:text-[17px]">
                {s.p?.map((p) => <p key={p}>{f(p)}</p>)}
                {s.ul && (
                  <ul className="grid gap-3">
                    {s.ul.map((li) => (
                      <li key={li} className="relative pl-5">
                        <span aria-hidden="true" className="absolute left-0 top-[0.62em] h-[6px] w-[6px] bg-ice" />
                        {f(li)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}
