import Link from "next/link";
import type { HomeCopy } from "@/lib/home-copy";
import CaseSheet from "./case-sheet";
import InView from "./in-view";
import { PANEL } from "./car-paths";
import { Arrow, ArrowDown, IconApprove, IconCells, IconKey, IconShield, Tick } from "./icons";

type C = HomeCopy;
const css = (o: Record<string, string>) => o as React.CSSProperties;

export function Rule() {
  return <div className="wrap" aria-hidden="true"><div className="reg-rule" /></div>;
}

/* ───────────────────────── hero ───────────────────────── */
export function Hero({ c, authed, labels, statuses }: { c: C; authed: boolean; labels: { start: string; cases: string }; statuses: string[] }) {
  return (
    <section className="wrap grid grid-cols-[minmax(0,1fr)] items-center gap-y-11 pb-20 pt-9 lg:min-h-[calc(100svh-64px)] lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-x-14 lg:pb-16 lg:pt-10">
      <div className="lg:pb-6">
        <h1 className="display text-balance text-[clamp(2.5rem,11.4vw,3.4rem)] lg:text-[2.75rem] xl:text-[clamp(3.6rem,5.1vw,4.7rem)]">
          <span className="block text-deep">{c.hero.line1}</span>
          <span className="block text-ink">{c.hero.line2}</span>
        </h1>
        <p className="mt-6 max-w-[31ch] text-[17px] leading-[1.55] text-mute lg:mt-7 lg:text-[19px]">{c.hero.support}</p>
        <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-1 lg:mt-10">
          <Link className="btn-primary" href={authed ? "/dashboard" : "/signup"}>
            {authed ? labels.cases : labels.start}
            <Arrow />
          </Link>
          <Link className="btn-quiet" href="#how">
            {c.hero.how}
            <ArrowDown />
          </Link>
        </div>
      </div>
      <CaseSheet demo={c.demo} statuses={statuses} replayLabel={c.hero.replay} />
    </section>
  );
}

/* ───────────────────────── time: two dimension lines, drawn to scale ───────────────────────── */
function Head({ side }: { side: "l" | "r" }) {
  return <svg className={`head ${side}`} viewBox="0 0 11 7" aria-hidden="true"><path d="M0 3.5L11 0v7z" /></svg>;
}

export function Time({ c }: { c: C["time"] }) {
  const fig = "display num text-[clamp(3.4rem,9.2vw,7.5rem)] leading-[0.9]";
  const unit = "display-2 text-[clamp(1.5rem,3.2vw,2.75rem)] leading-none";
  const lbl = "text-[16px] font-medium leading-none text-mute lg:text-[19px]";
  return (
    <section id="time" aria-labelledby="time-h" className="wrap py-20 lg:py-32">
      <h2 id="time-h" className="sr-only">{c.title}</h2>
      <InView>
        {/* datum line on the left = 0 min; full width = 20 min */}
        <div className="relative border-l border-ink pt-1">
          <p className="flex flex-wrap items-baseline gap-x-3 pl-4 text-deep lg:gap-x-4 lg:pl-7">
            <span className={fig}>{c.handValue}</span>
            <span className={unit}>{c.unit}</span>
            <span className={lbl}>{c.handLabel}</span>
          </p>

          <div className="relative mt-3 lg:mt-5">
            <span className="ext" style={{ left: "75%", top: 4, bottom: 34 }} aria-hidden="true" />
            <span className="ext" style={{ right: 0, top: 4, bottom: 34 }} aria-hidden="true" />
            <div className="dimline reveal-x text-deep" style={css({ "--t": "2s" })} aria-hidden="true">
              <span className="bar" style={{ right: "25%" }} />
              <span className="bar dashed" style={{ left: "75%" }} />
              <Head side="l" />
              <Head side="r" />
            </div>

            <p className="mt-9 flex flex-wrap items-baseline gap-x-3 pl-4 text-ink lg:mt-12 lg:gap-x-4 lg:pl-7">
              <span className={fig}>{c.autoValue}</span>
              <span className={unit}>{c.unit}</span>
              <span className={lbl}>{c.autoLabel}</span>
            </p>

            <div className="relative mt-3 lg:mt-5">
              <span className="ext" style={{ left: "5%", top: 4, bottom: 34 }} aria-hidden="true" />
              <span className="ext" style={{ left: "25%", top: 4, bottom: 34 }} aria-hidden="true" />
              <div className="flex items-center">
                <div className="dimline reveal-x w-1/4 shrink-0 text-ink" style={css({ "--t": "0.5s", "--w": "2s" })} aria-hidden="true">
                  <span className="bar" />
                  <span className="absolute left-0 top-1/2 -mt-[5px] h-[10px] w-1/5 bg-signal" />
                  <Head side="r" />
                </div>
                <p className="flex items-center gap-2.5 pl-4 text-[15px] font-medium leading-tight text-deep lg:pl-6 lg:text-[17px]">
                  <span className="h-[10px] w-[10px] shrink-0 bg-signal" aria-hidden="true" />
                  {c.yours}
                </p>
              </div>

              {/* the minute scale both lines are measured against */}
              <div className="relative mt-3 h-[34px]" aria-hidden="true">
                <span className="absolute inset-x-0 top-0 border-t border-ink" />
                {Array.from({ length: 21 }, (_, i) => (
                  <span key={i} className="absolute top-0 border-l border-ink" style={{ left: `${i * 5}%`, height: i % 5 === 0 ? 11 : 6 }} />
                ))}
                {[0, 5, 10, 15, 20].map((m) => (
                  <span
                    key={m}
                    className="note absolute top-[16px] text-mute"
                    style={m === 20 ? { right: 0 } : { left: `${m * 5}%`, transform: m === 0 ? "translateX(6px)" : "translateX(-50%)" }}
                  >
                    {m === 20 ? `${m} ${c.unit}` : m}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <p className="mt-12 flex flex-col gap-4 text-[17px] font-medium leading-snug text-deep sm:flex-row sm:items-center sm:gap-5 lg:mt-16 lg:text-[20px]">
          <span className="flex shrink-0 gap-[3px]" aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => <span key={i} className="h-[14px] w-[14px] bg-ink" />)}
          </span>
          {c.proof}
        </p>
      </InView>
    </section>
  );
}

/* ───────────────────────── how it works: three stations on one line ───────────────────────── */
function ArtUpload({ zip, or }: { zip: string; or: string }) {
  return (
    <div className="flex w-full max-w-[400px] items-end gap-4">
      {/* the zip */}
      <div className="shrink-0">
        <svg width="90" height="115" viewBox="0 0 78 100" fill="none" stroke="#1838A8" strokeWidth="1.25" aria-hidden="true">
          <path d="M1 1h54l22 22v76H1z" fill="#fff" />
          <path d="M55 1v22h22" />
          <path d="M26 6h6M32 12h6M26 18h6M32 24h6M26 30h6M32 36h6M26 42h6" strokeWidth="2" />
          <rect x="26" y="49" width="12" height="15" rx="1" />
          <path d="M32 55v4" strokeWidth="2" />
        </svg>
        <p className="note mt-2.5 text-deep">{zip}</p>
      </div>
      <span className="mb-[60px] text-[15px] text-mute">{or}</span>
      {/* PDFs + photos */}
      <div className="min-w-0">
        <svg width="218" height="115" viewBox="0 0 190 100" fill="none" stroke="#1838A8" strokeWidth="1.25" aria-hidden="true" className="max-w-full">
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${i * 14} ${(2 - i) * 7})`}>
              <path d="M1 15h36l12 12v58H1z" fill="#fff" />
              <path d="M37 15v12h12" />
              {i === 2 && <path d="M9 40h30M9 48h30M9 56h22M9 64h26" stroke="#C9D2E6" />}
            </g>
          ))}
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${96 + i * 14} ${(2 - i) * 7 + 37})`}>
              <rect x="1" y="1" width="64" height="47" fill="#fff" />
              {i === 2 && (
                <>
                  <path d="M1 38l17-15 13 10 11-8 23 16" />
                  <circle cx="49" cy="14" r="4.5" />
                </>
              )}
            </g>
          ))}
        </svg>
        <p className="note mt-2.5 text-deep">PDF + JPG</p>
      </div>
    </div>
  );
}

function Thumb({ kind }: { kind: number }) {
  // crops of the hero drawing
  const view = ["-98 -3 196 66", "-76 30 152 126", "-82 18 52 44"][kind];
  return (
    <svg width="46" height="32" viewBox={view} preserveAspectRatio="xMidYMid meet" className="shrink-0 border border-hair bg-white" aria-hidden="true">
      <g fill="none" stroke="#1838A8" strokeWidth="1.2" vectorEffect="non-scaling-stroke">
        {kind === 0 && <path d={PANEL.bumperF} vectorEffect="non-scaling-stroke" />}
        {kind === 1 && <path d={PANEL.bonnet} vectorEffect="non-scaling-stroke" />}
        {kind === 2 && <path d={PANEL.lampR} transform="scale(-1 1)" vectorEffect="non-scaling-stroke" />}
      </g>
    </svg>
  );
}

function ArtConfirm({ photos }: { photos: string[] }) {
  return (
    <ul className="w-full max-w-[340px]">
      {photos.map((name, i) => {
        const pending = i === photos.length - 1;
        return (
          <li key={name} className={`flex h-[50px] items-center gap-3.5 border-t px-2.5 ${pending ? "border-y border-deep bg-signaltint" : "border-hair"}`}>
            <Thumb kind={i} />
            <span className="text-[15px] font-medium text-deep">{name}</span>
            <span className={`ml-auto flex h-[20px] w-[20px] items-center justify-center border-[1.5px] ${pending ? "border-signal bg-white shadow-[0_0_0_3px_rgba(255,138,31,0.28)]" : "border-ink bg-white text-ink"}`}>
              {!pending && <Tick className="h-[14px] w-[14px]" />}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ArtDone({ cases, done, checking }: { cases: C["how"]["cases"]; done: string; checking: string }) {
  return (
    <ul className="w-full max-w-[340px]">
      {cases.map((k) => (
        <li key={k.name} className="flex h-[50px] items-center gap-3 border-t border-hair px-2.5 last:border-b">
          <span className="truncate text-[15px] font-medium text-deep">{k.name}</span>
          <span className={`ml-auto shrink-0 font-mono text-[13px] ${k.done ? "font-medium text-ink" : "text-mute"}`}>{k.done ? done : checking}</span>
          {k.done ? <Tick className="h-[15px] w-[15px] text-ink" /> : <span className="mx-[3px] h-[9px] w-[9px] rounded-full bg-signal" aria-hidden="true" />}
        </li>
      ))}
    </ul>
  );
}

export function How({ c, done, checking }: { c: C["how"]; done: string; checking: string }) {
  const art = [<ArtUpload key="u" zip={c.zip} or={c.or} />, <ArtConfirm key="c" photos={c.photos} />, <ArtDone key="d" cases={c.cases} done={done} checking={checking} />];
  return (
    <section id="how" aria-labelledby="how-h" className="wrap py-20 lg:py-32">
      <h2 id="how-h" className="display-2 text-[clamp(2rem,3.6vw,3.25rem)] text-ink">{c.title}</h2>
      <ol className="relative mt-12 grid gap-y-12 lg:mt-16 lg:grid-cols-3 lg:gap-x-12">
        {/* the one drawn line */}
        <span aria-hidden="true" className="absolute bottom-0 left-[15px] top-4 border-l-[1.5px] border-ink lg:bottom-auto lg:left-4 lg:right-0 lg:top-[203px] lg:border-l-0 lg:border-t-[1.5px]" />
        <svg aria-hidden="true" className="absolute right-0 top-[199.5px] hidden h-[8.5px] w-[13px] -scale-x-100 fill-ink lg:block" viewBox="0 0 11 7"><path d="M0 3.5L11 0v7z" /></svg>
        {c.steps.map((s, i) => (
          <li key={s.name} className="relative grid grid-cols-[32px_minmax(0,1fr)] gap-x-4 lg:block">
            <div className="col-start-2 row-start-2 mt-6 flex items-end lg:mt-0 lg:h-[160px]">{art[i]}</div>
            <span
              aria-hidden="true"
              className={`note relative col-start-1 row-start-1 flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-ink text-[14px] font-medium lg:mt-7 ${
                i === 2 ? "bg-ink text-white" : "bg-paper text-ink"
              }`}
            >
              {i + 1}
            </span>
            <div className="col-start-2 row-start-1 lg:mt-6">
              <h3 className="display-2 text-[28px] text-deep lg:text-[32px]">{s.name}</h3>
              <p className="mt-2 text-[17px] leading-snug text-mute lg:mt-2.5">{s.line}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ───────────────────────── keyed for you: the title block ───────────────────────── */
export function Keyed({ c }: { c: C["keyed"] }) {
  // column spans on the 12-col block: rows of 4·4 / 4·4 (beside the title), 3·5·4, 4·4·4
  const span = ["lg:col-span-4", "lg:col-span-4", "lg:col-span-4", "lg:col-span-4", "lg:col-span-3", "lg:col-span-5", "lg:col-span-4", "lg:col-span-4", "lg:col-span-4"];
  return (
    <section id="keyed" aria-labelledby="keyed-h" className="wrap py-20 lg:py-32">
      <InView>
        <div className="grid gap-px border-[1.5px] border-ink bg-hair lg:grid-cols-12">
          <div className="flex items-end bg-white px-5 pb-6 pt-14 lg:col-span-4 lg:row-span-2 lg:px-8 lg:pb-8">
            <h2 id="keyed-h" className="display-2 text-[clamp(2rem,3.6vw,3.25rem)] text-ink">{c.title}</h2>
          </div>
          {c.items.map((it, i) => (
            <div key={it} className={`flex min-h-[64px] items-center justify-between gap-4 bg-white px-5 lg:min-h-[96px] lg:px-7 ${span[i]}`}>
              <span className="display-3 text-[18px] text-deep lg:text-[20px]">{it}</span>
              <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center border-[1.5px] border-ink text-ink" style={css({ "--w": `${i * 90}ms` })}>
                <Tick className="h-[15px] w-[15px]" draw />
              </span>
            </div>
          ))}
          <div className="flex min-h-[64px] items-center justify-between gap-4 bg-ink px-5 lg:col-span-4 lg:min-h-[96px] lg:px-7">
            <span className="display-3 text-[18px] text-white lg:text-[20px]">{c.signoff}</span>
            <span className="text-white" style={css({ "--w": "900ms" })}><Tick className="h-[22px] w-[22px]" draw /></span>
          </div>
        </div>
      </InView>
    </section>
  );
}

/* ───────────────────────── security ───────────────────────── */
export function Security({ c }: { c: C["security"] }) {
  const icons = [<IconKey key="k" />, <IconCells key="c" />, <IconShield key="s" />, <IconApprove key="a" />];
  return (
    <section id="security" aria-labelledby="security-h" className="wrap grid gap-y-8 py-20 lg:grid-cols-12 lg:gap-x-12 lg:py-32">
      <h2 id="security-h" className="display-2 text-[clamp(2rem,3.6vw,3.25rem)] text-ink lg:col-span-4">{c.title}</h2>
      {/* four statements on one hairline cross */}
      <ul className="relative grid border-y border-hair sm:grid-cols-2 lg:col-span-8">
        {/* registration mark where the two hairlines cross */}
        <li aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 hidden h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2 text-ink sm:block">
          <svg viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1"><path d="M6.5 0v13M0 6.5h13" /></svg>
        </li>
        {c.items.map((it, i) => (
          <li
            key={it.name}
            className={`flex gap-5 py-7 sm:flex-col sm:gap-0 sm:py-9 lg:py-10 ${i > 0 ? "border-t border-hair" : ""} ${i < 2 ? "sm:border-t-0" : ""} ${
              i % 2 === 0 ? "sm:pr-8 lg:pr-12" : "sm:border-l sm:border-hair sm:pl-8 lg:pl-12"
            }`}
          >
            <span className="shrink-0 text-ink">{icons[i]}</span>
            <div>
              <h3 className="display-3 text-[20px] text-deep sm:mt-7 lg:text-[23px]">{it.name}</h3>
              <p className="mt-2 max-w-[34ch] text-[16px] leading-snug text-mute lg:text-[17px]">{it.line}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ───────────────────────── faq ───────────────────────── */
export function Faq({ c }: { c: C["faq"] }) {
  return (
    <section id="faq" aria-labelledby="faq-h" className="wrap grid gap-y-8 py-20 lg:grid-cols-12 lg:gap-x-12 lg:py-32">
      <h2 id="faq-h" className="display-2 text-[clamp(2rem,3.6vw,3.25rem)] text-ink lg:col-span-4">{c.title}</h2>
      <div className="faq lg:col-span-8">
        {c.items.map((it) => (
          <details key={it.q} className="group border-t border-hair last:border-b">
            <summary className="flex min-h-[68px] items-center justify-between gap-6 py-4 lg:min-h-[76px]">
              <span className="display-3 text-[18px] text-deep group-open:text-ink lg:text-[21px]">{it.q}</span>
              <svg className="shrink-0 text-ink" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M1 9h16" />
                <path className="pm-v" d="M9 1v16" />
              </svg>
            </summary>
            <p className="max-w-[58ch] pb-7 text-[17px] leading-relaxed text-mute">{it.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ───────────────────────── closing ───────────────────────── */
export function Closing({ c, authed, labels }: { c: C["closing"]; authed: boolean; labels: { start: string; cases: string } }) {
  return (
    <section aria-labelledby="closing-h" className="bg-ink text-white">
      <div className="wrap flex flex-col gap-10 py-20 lg:flex-row lg:items-end lg:justify-between lg:py-28">
        <div className="min-w-0 flex-1">
          <h2 id="closing-h" className="display max-w-[14ch] text-balance text-[clamp(2.5rem,5.6vw,5rem)]">{c.title}</h2>
          {/* the 5-minute dimension line again: one fifth of it (1 min) is yours */}
          <div className="dimline mt-9 w-1/4 min-w-[120px] text-white lg:mt-12" aria-hidden="true">
            <span className="absolute -top-1 bottom-[-4px] left-0 border-l border-white/60" />
            <span className="absolute -top-1 bottom-[-4px] right-0 border-l border-white/60" />
            <span className="bar" />
            <span className="absolute left-0 top-1/2 -mt-[5px] h-[10px] w-1/5 bg-signal" />
            <Head side="r" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-7 gap-y-2 lg:mb-2">
          <Link
            href={authed ? "/dashboard" : "/signup"}
            className="inline-flex h-14 items-center justify-center gap-3 whitespace-nowrap rounded-[4px] bg-white px-8 text-[16px] font-semibold text-ink transition-colors hover:bg-signal hover:text-deep focus-visible:outline-white"
          >
            {authed ? labels.cases : labels.start}
            <Arrow />
          </Link>
          <Link
            href="/contact"
            className="inline-flex h-12 items-center whitespace-nowrap text-[16px] font-semibold text-white underline decoration-white/40 decoration-1 underline-offset-[6px] transition-colors hover:decoration-white focus-visible:outline-white"
          >
            {c.talk}
          </Link>
        </div>
      </div>
    </section>
  );
}
