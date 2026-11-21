"use client";
import { useId } from "react";
import { useT } from "@/components/lang-provider";
import { SIDES, type Side } from "@/lib/damage-sides";

/** "RM 1,234.50"; null when the total is not known yet. */
export function money(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Top-down car, front at the top; every hit side is lit amber on the body. */
export function CarSides({ sides, className = "h-[96px] w-[48px]" }: { sides: Side[]; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const body = "M50 5C72 5 82 17 84 40L86 70C87 90 87 112 86 135L84 168C82 188 70 195 50 195C30 195 18 188 16 168L14 135C13 112 13 90 14 70L16 40C18 17 28 5 50 5Z";
  const hit = (s: Side) => sides.includes(s);
  return (
    <svg viewBox="0 0 100 200" className={className} aria-hidden="true">
      <defs><clipPath id={uid}><path d={body} /></clipPath></defs>
      {/* wheels */}
      {[[3, 34], [3, 136], [89, 34], [89, 136]].map(([x, y]) => <rect key={`${x}${y}`} x={x} y={y} width="8" height="30" rx="3" className="fill-fg" />)}
      {/* mirrors */}
      <ellipse cx="12" cy="82" rx="5" ry="3.5" className="fill-hair2" />
      <ellipse cx="88" cy="82" rx="5" ry="3.5" className="fill-hair2" />
      <path d={body} className="fill-panel2" />
      <g clipPath={`url(#${uid})`} className="fill-amber">
        {hit("front") && <rect x="0" y="0" width="100" height="60" />}
        {hit("rear") && <rect x="0" y="148" width="100" height="52" />}
        {hit("left") && <rect x="0" y="40" width="26" height="116" />}
        {hit("right") && <rect x="74" y="40" width="26" height="116" />}
      </g>
      {/* glass and roof */}
      <path d="M29 62H71L76 86H24Z" className="fill-fg" opacity="0.78" />
      <rect x="24" y="86" width="52" height="42" rx="6" className="fill-panel stroke-hair2" strokeWidth="1.2" />
      <path d="M24 128H76L71 150H29Z" className="fill-fg" opacity="0.78" />
      {/* bonnet and boot lines */}
      <path d="M30 22Q50 30 70 22M32 172Q50 166 68 172" fill="none" className="stroke-hair2" strokeWidth="1.2" />
      {/* head and tail lamps */}
      <path d="M20 17L34 13L33 22L19 27Z M80 17L66 13L67 22L81 27Z" className="fill-panel stroke-hair2" strokeWidth="1" />
      <path d="M20 182L34 186L33 178L19 174Z M80 182L66 186L67 178L81 174Z" className="fill-fg" opacity="0.55" />
      <path d={body} fill="none" className="stroke-hair2" strokeWidth="1.5" />
    </svg>
  );
}

/** Solid amber chips, one per hit side: the words must be seen at a glance. */
export function SideChips({ sides, small }: { sides?: Side[]; small?: boolean }) {
  const { t } = useT();
  if (!sides) return <span className="text-[13px] text-mute">{t("side.unavailable")}</span>;
  if (!sides.length) return <span className="text-[13px] text-mute">{t("side.none")}</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {SIDES.filter((s) => sides.includes(s)).map((s) => (
        <li key={s} className={`rounded-[3px] bg-amber font-semibold leading-none text-white ${small ? "px-2.5 py-1.5 text-[14px]" : "px-3 py-2 text-[16px]"}`}>
          {t(`side.${s}`)}
        </li>
      ))}
    </ul>
  );
}

type R = { totalRm?: string | null; sides?: Side[] };

/** The total on a list row. */
export function Total({ row, big }: { row: R; big?: boolean }) {
  const m = money(row.totalRm);
  if (!m) return null;
  return <span className={`num font-mono font-medium text-fg ${big ? "text-[22px] leading-none lg:text-[26px]" : "text-[15.5px] leading-none"}`}>{m}</span>;
}

/** The result block at the top of a finished case's page: the car with its hit sides, the total, the model. */
export function ResultBlock({ carModel, totalRm, sides }: { carModel: string | null } & R) {
  const { t } = useT();
  return (
    <div className="flex items-center gap-6 border-b border-hair bg-panel2 px-5 py-5 sm:gap-8 sm:px-8">
      <CarSides sides={sides ?? []} className="h-[132px] w-[66px] shrink-0 sm:h-[150px] sm:w-[75px]" />
      <div className="min-w-0">
        <p className="note text-mute">{t("dash.total")}</p>
        <p className="num font-mono text-[32px] font-medium leading-tight text-fg sm:text-[38px]">{money(totalRm) ?? "–"}</p>
        <p className="mt-1 truncate text-[15px] text-fg">{carModel}</p>
        <div className="mt-2.5"><SideChips sides={sides} /></div>
      </div>
    </div>
  );
}
