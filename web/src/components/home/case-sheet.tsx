"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { DamagedPanel, HomeCopy } from "@/lib/home-copy";
import { CAR_VIEWBOX, DETAIL, LEADER, PANEL } from "./car-paths";

/* Timeline of the load sequence, in ms. The clock shown on the sheet runs 00:00 → 05:00 over it. */
const PART_START = 2100;
const PART_STEP = 680;
const TOTAL_AT = 5240;
const CHECK_AT = 5950;
const END = 6600;
const STATUS_AT = [0, 300, 750, 1200, 1650, PART_START, CHECK_AT, END]; // when each status becomes the live one
const CLOCK: [number, number][] = [[300, 0], [1650, 120], [PART_START, 180], [CHECK_AT, 270], [END, 300]]; // [ms, case seconds]

function clockAt(ms: number) {
  if (ms <= CLOCK[0][0]) return 0;
  for (let i = 1; i < CLOCK.length; i++) {
    const [t1, s1] = CLOCK[i];
    const [t0, s0] = CLOCK[i - 1];
    if (ms <= t1) return s0 + ((ms - t0) / (t1 - t0)) * (s1 - s0);
  }
  return CLOCK[CLOCK.length - 1][1];
}
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const v = (o: Record<string, string>) => o as CSSProperties;

function Crop() {
  // crop marks just outside each corner of the sheet
  const mark = "pointer-events-none absolute h-[11px] w-[11px] text-ink";
  const svg = (
    <svg viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1" className="block h-full w-full">
      <path d="M0 10.5h7M10.5 0v7" />
    </svg>
  );
  return (
    <span aria-hidden="true">
      <span className={`${mark} -left-[11px] -top-[11px]`}>{svg}</span>
      <span className={`${mark} -right-[11px] -top-[11px] -scale-x-100`}>{svg}</span>
      <span className={`${mark} -bottom-[11px] -left-[11px] -scale-y-100`}>{svg}</span>
      <span className={`${mark} -bottom-[11px] -right-[11px] -scale-100`}>{svg}</span>
    </span>
  );
}

type Demo = HomeCopy["demo"];

export default function CaseSheet({ demo, statuses, replayLabel }: { demo: Demo; statuses: string[]; replayLabel: string }) {
  const [run, setRun] = useState(0);
  const [active, setActive] = useState<DamagedPanel | null>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const digitsRef = useRef<HTMLSpanElement>(null);

  // Drive the mm:ss read-out from the CSS animation clock, so both stay in step.
  useEffect(() => {
    const el = clockRef.current;
    const out = digitsRef.current;
    if (!el || !out) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const anim = el.getAnimations?.().find((a) => (a as CSSAnimation).animationName === "sheet-clock");
    if (still || !anim) { out.textContent = demo.clock; return; }
    const t0 = performance.now() - Number(anim.currentTime ?? 0);
    let raf = 0;
    el.setAttribute("data-live", "");
    const tick = () => {
      const ms = Number(anim.currentTime ?? performance.now() - t0);
      if (ms >= END) { out.textContent = demo.clock; return; }
      out.textContent = mmss(clockAt(ms));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [run, demo.clock]);

  const on = (id: DamagedPanel) => ({
    onMouseEnter: () => setActive(id),
    onMouseLeave: () => setActive((a) => (a === id ? null : a)),
  });
  const delay = (i: number) => `${PART_START + i * PART_STEP}ms`;
  const idx = (id: DamagedPanel) => demo.parts.findIndex((p) => p.id === id);

  const dmg = (id: DamagedPanel, d: string, mirror = false) => (
    <g
      key={id}
      className={`dmg ${active === id ? "is-on" : ""}`}
      style={v({ "--d": delay(idx(id)) })}
      transform={mirror ? "scale(-1 1)" : undefined}
      {...on(id)}
    >
      <path className="pnl" d={d} />
      <path className="dmg-fill" d={d} />
      <path className="dmg-hatch" d={d} fill={mirror ? "url(#dmg-hatch-m)" : "url(#dmg-hatch)"} />
    </g>
  );

  return (
    <figure key={run} aria-label={demo.figure} style={v({ "--end": `${END}ms` })} className="sheet sheet-play relative mx-auto w-full max-w-[660px] lg:mx-0">
      <Crop />
      <div className="overflow-hidden rounded-[4px] border border-hair bg-white">
        {/* case header */}
        <div className="flex h-[52px] items-center gap-2.5 border-b border-hair pl-3 sm:h-[58px] sm:gap-3 sm:pl-5 sm:pr-2">
          <span className="min-w-0 truncate text-[14px] font-semibold text-deep sm:text-[16px]">{demo.model}</span>
          <span className="hidden truncate text-[14px] text-mute sm:inline">{demo.kind}</span>
          <span ref={clockRef} className="sheet-clock ml-auto flex shrink-0 items-center gap-2 sm:gap-2.5">
            <span className="relative block h-2.5 w-2.5" aria-hidden="true">
              <span className="sheet-busy absolute inset-0 rounded-full bg-signal" />
              <svg className="sheet-done absolute -inset-[3px]" viewBox="0 0 16 16" fill="none" stroke="#1838A8" strokeWidth="2">
                <path d="M2.5 8.5l3.5 3.5 7.5-8" />
              </svg>
            </span>
            <span ref={digitsRef} className="sheet-digits font-mono text-[16px] font-medium leading-none text-deep [font-variant-numeric:tabular-nums] sm:text-[21px]">
              {demo.clock}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setRun((n) => n + 1)}
            aria-label={replayLabel}
            title={replayLabel}
            className="-ml-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-[4px] text-mute transition-colors hover:text-ink motion-reduce:mr-3 motion-reduce:w-0 motion-reduce:overflow-hidden sm:ml-0"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M13.5 8a5.5 5.5 0 1 1-1.9-4.2" />
              <path d="M13.6 1.6v3.2h-3.2" />
            </svg>
          </button>
        </div>

        {/* ledger + drawing */}
        <div className="relative grid grid-cols-[minmax(0,1fr)_auto]">
          <div className="sheet-grid pointer-events-none absolute inset-0" aria-hidden="true" />

          <div className="relative flex flex-col pl-3 sm:pl-5">
            <ol>
              {demo.parts.map((p, i) => (
                <li key={p.id} className="ledger-row" data-on={active === p.id} style={v({ "--d": delay(i) })} {...on(p.id)}>
                  <span className="ledger-hi" aria-hidden="true" />
                  <span className="ledger-rule" aria-hidden="true" />
                  <span className="type-wrap">
                    <span className="type flex items-baseline justify-between gap-2 pb-[3px] pr-1 sm:pb-[5px] sm:pr-3">
                      <span className="truncate text-[12.5px] font-medium leading-tight text-deep sm:text-[15px]">{p.name}</span>
                      <svg className="h-[13px] w-[13px] shrink-0 self-center text-ink sm:h-[15px] sm:w-[15px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M3 8.6l3.2 3.2L13 4.4" />
                      </svg>
                    </span>
                  </span>
                </li>
              ))}
              <li className="ledger-row" style={v({ "--d": `${TOTAL_AT}ms` })}>
                <span className="type-wrap">
                  <span className="type flex items-baseline justify-between gap-2 pr-1 sm:pr-3">
                    <span className="text-[12.5px] font-semibold leading-tight text-deep sm:text-[15px]">{demo.totalLabel}</span>
                    <span className="shrink-0 border-b-[3px] border-double border-deep pb-[2px] font-mono text-[11.5px] font-medium leading-tight text-deep [font-variant-numeric:tabular-nums] sm:text-[14px]">
                      {demo.total}
                    </span>
                  </span>
                </span>
              </li>
            </ol>

            {/* case status log */}
            <ol className="mb-3 mr-1 mt-3 flex flex-1 flex-col border-t border-hair pt-2 sm:mb-4 sm:mr-3 sm:mt-5 sm:pt-3">
              {statuses.map((s, i) => {
                const last = i === statuses.length - 1;
                const start = STATUS_AT[i];
                const end = last ? END : STATUS_AT[i + 1];
                return (
                  <li
                    key={s}
                    className="flex min-h-[21px] flex-1 items-center gap-2 sm:min-h-[26px] sm:gap-2.5"
                    style={v({ "--s": `${start}ms`, "--e": `${end}ms` })}
                  >
                    <span className="relative block h-3 w-3 shrink-0" aria-hidden="true">
                      <span className="st-ring absolute inset-[3px] rounded-full border border-hair" />
                      <span className="st-live absolute inset-[2px] rounded-full bg-signal" />
                      <svg className="st-tick absolute inset-0" viewBox="0 0 12 12" fill="none" stroke="#1838A8" strokeWidth="1.6">
                        <path d="M2 6.4l2.6 2.6L10 3.2" />
                      </svg>
                    </span>
                    <span className={`st-text truncate font-mono text-[10.5px] leading-none tracking-[-0.02em] sm:text-[13px] sm:tracking-normal ${last ? "font-medium text-ink" : "text-mute"}`}>{s}</span>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* exploded top view */}
          <svg className="car relative" viewBox={CAR_VIEWBOX} aria-hidden="true">
            <defs>
              <pattern id="dmg-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="5" stroke="#0B1533" strokeOpacity="0.2" strokeWidth="1.1" />
              </pattern>
              <pattern id="dmg-hatch-m" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                <line x1="0" y1="0" x2="0" y2="5" stroke="#0B1533" strokeOpacity="0.2" strokeWidth="1.1" />
              </pattern>
            </defs>

            <path className="axis" d="M 0 -14 V 464" />

            {/* undamaged panels */}
            <path className="pnl" d={PANEL.bumperR} />
            <path className="pnl" d={PANEL.tailgate} />
            <path className="pnl" d={PANEL.roof} />
            <path className="glass" d={PANEL.windscreen} />
            <path className="glass" d={PANEL.rearGlass} />
            {[1, -1].map((s) => (
              <g key={s} transform={`scale(${s} 1)`}>
                <path className="pnl" d={PANEL.mirrorR} />
                <path className="pnl" d={PANEL.doorFR} />
                <path className="pnl" d={PANEL.doorRR} />
                <path className="pnl" d={PANEL.quarterR} />
                <path className="pnl" d={PANEL.tailLampR} />
                <path className="glass" d={PANEL.sideGlassFR} />
                <path className="glass" d={PANEL.sideGlassRR} />
                <path className="glass" d={PANEL.quarterGlassR} />
              </g>
            ))}
            <path className="pnl" d={PANEL.lampR} />
            <path className="pnl" d={PANEL.fenderR} />

            {/* damaged panels — fill amber one after another */}
            {dmg("bumper", PANEL.bumperF)}
            {dmg("grille", PANEL.grille)}
            {dmg("lampL", PANEL.lampR, true)}
            {dmg("bonnet", PANEL.bonnet)}
            {dmg("fenderL", PANEL.fenderR, true)}

            {/* details */}
            {DETAIL.centre.map((d) => <path key={d} className="detail" d={d} />)}
            {[1, -1].map((s) => (
              <g key={s} transform={`scale(${s} 1)`}>
                {DETAIL.right.map((d) => <path key={d} className="detail" d={d} />)}
                {DETAIL.lens.map(([cx, cy]) => <circle key={cx} className="detail" cx={cx} cy={cy} r="2.9" />)}
                <circle className="detail" cx="20" cy="133" r="0.9" />
              </g>
            ))}
            <circle className="detail-fill" cx="0" cy="25.6" r="2.4" />
            <ellipse className="detail-fill" cx="0" cy="357" rx="1.9" ry="4.4" />

            {/* leaders: panel → ledger row */}
            {demo.parts.map((p, i) => {
              const l = LEADER[p.id];
              return (
                <g key={p.id} style={v({ "--d": delay(i) })}>
                  <path className={`leader ${active === p.id ? "is-on" : ""}`} d={l.path} pathLength={1} />
                  <circle className="leader-dot" cx={l.dot[0]} cy={l.dot[1]} r="1.9" />
                  <circle className="leader-ring" cx={-131} cy={l.y} r="2.4" />
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </figure>
  );
}
