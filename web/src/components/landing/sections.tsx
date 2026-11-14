import Link from "next/link";
import type { CSSProperties } from "react";
import type { HomeCopy } from "@/lib/home-copy";
import InView from "@/components/in-view";
import { Arrow, IconApprove, IconCells, IconKey, IconShield, Tick } from "@/components/icons";

type C = HomeCopy;
const css = (v: Record<string, string>) => v as CSSProperties;

export function Seam() {
  return <div className="wrap" aria-hidden="true"><div className="reg-rule" /></div>;
}

/** Time per case, drawn to scale: two light bars on the same 20-minute floor. */
export function Proof({ c }: { c: C["time"] }) {
  const fig = "display num text-[clamp(4.5rem,13vw,11rem)] leading-[0.82]";
  const unit = "display-2 text-[clamp(1.4rem,2.6vw,2.25rem)]";
  const lbl = "note uppercase tracking-[0.16em]";
  return (
    <section id="after-journey" aria-labelledby="proof-h" className="wrap scroll-mt-20 py-24 lg:py-40">
      <h2 id="proof-h" className="sr-only">{c.title}</h2>
      <InView className="grid gap-14 lg:gap-20">
        <div>
          <p className={`${lbl} text-mute`}>{c.handLabel}</p>
          <p className="mt-3 flex items-baseline gap-3 text-mute">
            <span className={fig}>{c.handValue}</span>
            <span className={unit}>{c.unit}</span>
          </p>
          {/* 0 to 15 solid, 15 to 20 fading: "15 to 20" */}
          <div className="mt-6 h-[6px] w-full rounded-full bg-hair" aria-hidden="true">
            <div className="lightbar h-full rounded-full" style={css({ "--to": "100%", "--t": "1.8s", background: "linear-gradient(90deg, #5A6573 0, #5A6573 75%, rgba(90,101,115,0.25) 100%)" })} />
          </div>
        </div>
        <div>
          <p className={`${lbl} text-ice`}>{c.autoLabel}</p>
          <p className="mt-3 flex items-baseline gap-3 text-ice">
            <span className={fig}>{c.autoValue}</span>
            <span className={unit}>{c.unit}</span>
          </p>
          <div className="mt-6 flex items-center gap-4" aria-hidden="true">
            <div className="h-[6px] w-full rounded-full bg-hair">
              {/* 5 of 20 minutes; the first fifth of it (1 minute) is the user's */}
              <div className="lightbar h-full rounded-full shadow-[0_0_18px_rgba(191,233,255,0.6)]" style={css({ "--to": "25%", "--t": "0.6s", "--w": "1.8s", background: "linear-gradient(90deg, #FFB020 0, #FFB020 20%, #BFE9FF 20%)" })} />
            </div>
          </div>
          <p className="mt-4 flex items-center gap-2.5 text-[15px] font-medium text-fg lg:text-[17px]">
            <span className="h-[10px] w-[10px] shrink-0 rounded-[2px] bg-amber" aria-hidden="true" />
            {c.yours}
          </p>
        </div>
        <p className="flex flex-col gap-4 text-[18px] font-medium leading-snug text-fg sm:flex-row sm:items-center sm:gap-5 lg:text-[21px]">
          <span className="flex shrink-0 gap-[4px]" aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => <span key={i} className="pip h-[14px] w-[14px] rounded-[2px] bg-go" style={css({ "--w": `${2400 + i * 70}ms` })} />)}
          </span>
          {c.proof}
        </p>
      </InView>
    </section>
  );
}

/** Everything that is keyed: a checklist that ticks itself. */
export function Keyed({ c }: { c: C["keyed"] }) {
  return (
    <section aria-labelledby="keyed-h" className="wrap grid gap-y-10 py-24 lg:grid-cols-12 lg:gap-x-12 lg:py-36">
      <h2 id="keyed-h" className="display-2 text-[clamp(2.2rem,4vw,3.6rem)] text-fg lg:col-span-4">{c.title}</h2>
      <InView className="lg:col-span-8">
        <ul className="grid border-t border-hair sm:grid-cols-2">
          {c.items.map((it, i) => (
            <li key={it} className="flex min-h-[64px] items-center justify-between gap-4 border-b border-hair sm:odd:pr-8 sm:even:border-l sm:even:pl-8 lg:min-h-[72px]">
              <span className="display-3 text-[18px] text-fg lg:text-[20px]">{it}</span>
              <span className="text-go" style={css({ "--w": `${i * 90}ms` })}><Tick className="h-[20px] w-[20px]" draw /></span>
            </li>
          ))}
          <li className="flex min-h-[64px] items-center justify-between gap-4 border-b border-go bg-gotint px-4 sm:pl-8 lg:min-h-[72px]">
            <span className="display-3 text-[18px] text-go lg:text-[20px]">{c.signoff}</span>
            <span className="text-go" style={css({ "--w": "900ms" })}><Tick className="h-[22px] w-[22px]" draw /></span>
          </li>
        </ul>
      </InView>
    </section>
  );
}

export function Security({ c }: { c: C["security"] }) {
  const icons = [<IconKey key="k" />, <IconCells key="c" />, <IconShield key="s" />, <IconApprove key="a" />];
  return (
    <section id="security" aria-labelledby="security-h" className="wrap grid gap-y-10 py-24 lg:grid-cols-12 lg:gap-x-12 lg:py-36">
      <h2 id="security-h" className="display-2 text-[clamp(2.2rem,4vw,3.6rem)] text-fg lg:col-span-4">{c.title}</h2>
      <ul className="grid gap-px overflow-hidden rounded-[3px] border border-hair bg-hair sm:grid-cols-2 lg:col-span-8">
        {c.items.map((it, i) => (
          <li key={it.name} className="flex gap-5 bg-panel p-6 sm:flex-col sm:gap-0 sm:p-8 lg:p-10">
            <span className="shrink-0 text-ice">{icons[i]}</span>
            <div>
              <h3 className="display-3 text-[20px] text-fg sm:mt-8 lg:text-[23px]">{it.name}</h3>
              <p className="mt-2 max-w-[34ch] text-[16px] leading-snug text-mute lg:text-[17px]">{it.line}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Faq({ c }: { c: C["faq"] }) {
  return (
    <section id="faq" aria-labelledby="faq-h" className="wrap grid gap-y-10 py-24 lg:grid-cols-12 lg:gap-x-12 lg:py-36">
      <h2 id="faq-h" className="display-2 text-[clamp(2.2rem,4vw,3.6rem)] text-fg lg:col-span-4">{c.title}</h2>
      <div className="faq lg:col-span-8">
        {c.items.map((it) => (
          <details key={it.q} className="group border-t border-hair last:border-b">
            <summary className="flex min-h-[68px] items-center justify-between gap-6 py-4 lg:min-h-[80px]">
              <span className="display-3 text-[19px] text-fg group-open:text-ice lg:text-[22px]">{it.q}</span>
              <svg className="shrink-0 text-ice" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
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

/** The last screen: the light comes back on, one button. */
export function Closing({ c, authed, labels }: { c: C["closing"]; authed: boolean; labels: { start: string; cases: string } }) {
  return (
    <section aria-labelledby="closing-h" className="relative overflow-hidden border-t border-hair">
      <span className="scan-edge" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0" aria-hidden="true" style={{ backgroundImage: "radial-gradient(60% 90% at 50% 0%, rgba(191,233,255,0.16), rgba(191,233,255,0.04) 45%, transparent 75%)" }} />
      <div className="wrap relative flex flex-col items-start gap-10 py-28 lg:py-44">
        <h2 id="closing-h" className="display max-w-[13ch] text-balance text-[clamp(3rem,8.4vw,8.5rem)] text-fg">{c.title}</h2>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <Link href={authed ? "/dashboard" : "/signup"} className="btn-primary !h-14 !px-8 !text-[16px]">
            {authed ? labels.cases : labels.start}
            <Arrow />
          </Link>
          <Link href="/contact" className="btn-quiet">{c.talk}</Link>
        </div>
      </div>
    </section>
  );
}
