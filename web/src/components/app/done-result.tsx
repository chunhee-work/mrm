"use client";
import { useT } from "@/components/lang-provider";
import { SIDES, type Side } from "@/lib/damage-sides";

/** "RM 1,234.50"; null when the total is not known yet. */
export function money(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The sides in words, in the user's language: "Front · Left". */
export function useSideWords() {
  const { t } = useT();
  return (sides: Side[]) => sides.map((s) => t(`side.${s}`));
}

/** Amber chips, one per hit side. */
export function SideChips({ sides, small }: { sides: Side[]; small?: boolean }) {
  const { t } = useT();
  if (!sides.length) return <span className="text-[13px] text-mute">{t("side.none")}</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {SIDES.filter((s) => sides.includes(s)).map((s) => (
        <li key={s} className={`rounded-[3px] bg-ambertint font-medium text-fg ${small ? "px-2 py-[3px] text-[12.5px]" : "px-2.5 py-1 text-[13.5px]"} leading-none`}>
          <span aria-hidden="true" className="mr-1.5 inline-block h-[7px] w-[7px] rounded-full bg-amber align-[1px]" />
          {t(`side.${s}`)}
        </li>
      ))}
    </ul>
  );
}

type R = { totalRm: string | null; sides: Side[] };

/** The total on a list row. */
export function Total({ row, big }: { row: R; big?: boolean }) {
  const m = money(row.totalRm);
  if (!m) return null;
  return <span className={`num font-mono font-medium text-fg ${big ? "text-[22px] leading-none lg:text-[26px]" : "text-[15.5px] leading-none"}`}>{m}</span>;
}

/** The result strip at the top of a finished case's page: car model, total, hit sides. */
export function ResultBlock({ carModel, totalRm, sides }: { carModel: string | null } & R) {
  const { t } = useT();
  const m = money(totalRm);
  return (
    <dl className="grid gap-px border-b border-hair bg-hair sm:grid-cols-3">
      {[
        [t("case.model"), <span key="m" className="text-[16px] text-fg">{carModel ?? "–"}</span>],
        [t("dash.total"), <span key="t" className="num font-mono text-[20px] font-medium text-fg">{m ?? "–"}</span>],
        [t("dash.hit"), <SideChips key="s" sides={sides} />],
      ].map(([k, v], i) => (
        <div key={i} className="bg-panel px-5 py-4 sm:px-8 sm:py-5">
          <dt className="note mb-2 text-mute">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
