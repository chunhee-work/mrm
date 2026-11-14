import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/admin/auth";
import type { Scope } from "@/lib/admin/queries";

export type Sp = Promise<{ [k: string]: string | string[] | undefined }>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
export async function readSp(sp: Sp) {
  const s = await sp;
  const scope: Scope = { includeInternal: one(s.internal) === "1" };
  return { scope, q: one(s.q) ?? "", page: Math.max(0, Number(one(s.page)) || 0) };
}

export const usd = (n: number | null) => (n === null ? "unpriced" : n === 0 ? "$0" : n < 1 ? `$${n.toFixed(4)}` : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const when = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "never");
export const int = (n: number) => n.toLocaleString("en-US");

const NAV = [
  ["", "Overview"], ["users", "Users"], ["cost", "Cost"], ["cases", "Cases"], ["errors", "Errors & email"], ["health", "Health"],
] as const;

export async function Shell({ current, scope, children }: { current: string; scope: Scope; children: ReactNode }) {
  const me = await requireAdmin();
  const qs = scope.includeInternal ? "?internal=1" : "";
  return (
    <div className="min-h-screen bg-paper text-deep">
      <header className="border-b border-hair bg-white">
        <div className="mx-auto flex max-w-sheet flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <span className="display-3 text-[17px] text-ink">Autopilotclaim <span className="note text-mute">admin</span></span>
          <nav aria-label="Admin" className="flex w-full min-w-0 flex-wrap gap-1 sm:w-auto sm:flex-1">
            {NAV.map(([slug, label]) => (
              <Link key={slug} href={`/admin${slug ? "/" + slug : ""}${qs}`} aria-current={current === slug ? "page" : undefined}
                className={`whitespace-nowrap rounded-[4px] px-3 py-2 text-[14px] ${current === slug ? "bg-ink text-white" : "text-mute hover:bg-inktint"}`}>{label}</Link>
            ))}
          </nav>
          <span className="note hidden text-mute sm:block">{me.email}</span>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-sheet px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <p className="note text-mute">{scope.includeInternal ? "Including internal accounts (owner, smoke test)" : "Excluding internal accounts (owner, smoke test)"}</p>
          <Link href={`?${scope.includeInternal ? "" : "internal=1"}`} className="note rounded-[4px] border border-hair bg-white px-3 py-2 text-ink hover:bg-inktint">
            {scope.includeInternal ? "Hide internal accounts" : "Include internal accounts"}
          </Link>
        </div>
        {children}
      </main>
    </div>
  );
}

export function H({ children }: { children: ReactNode }) {
  return <h2 className="display-3 mb-3 text-[18px] text-deep">{children}</h2>;
}

export function Stat({ label, value, note, warn }: { label: string; value: string; note?: string; warn?: boolean }) {
  return (
    <div className={`rounded-[4px] border bg-white p-4 ${warn ? "border-signal" : "border-hair"}`}>
      <p className="note text-mute">{label}</p>
      <p className="num mt-1 text-[28px] font-semibold leading-none text-deep">{value}</p>
      {note ? <p className="note mt-2 text-mute">{note}</p> : null}
    </div>
  );
}

export function Card({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="rounded-[4px] border border-hair bg-white p-4">
      <H>{title}</H>
      {children}
      {note ? <p className="note mt-3 text-mute">{note}</p> : null}
    </section>
  );
}

export function Bars({ data, label, fmt = (n: number) => String(n) }: { data: { date: string; v: number }[]; label: string; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.v));
  const w = 600, h = 120, bw = w / Math.max(1, data.length);
  return (
    <svg viewBox={`0 0 ${w} ${h + 18}`} role="img" aria-label={label} className="h-36 w-full">
      <line x1="0" y1={h} x2={w} y2={h} stroke="#C9D2E6" />
      {data.map((d, i) => (
        <rect key={d.date} x={i * bw + 2} y={h - (d.v / max) * (h - 6)} width={Math.max(1, bw - 4)} height={(d.v / max) * (h - 6)} fill="#1838A8" opacity={d.v ? 1 : 0.15}>
          <title>{`${d.date}: ${fmt(d.v)}`}</title>
        </rect>
      ))}
      <text x="0" y={h + 14} fontSize="10" fill="#4B587C">{data[0]?.date}</text>
      <text x={w} y={h + 14} fontSize="10" fill="#4B587C" textAnchor="end">{data[data.length - 1]?.date}</text>
    </svg>
  );
}

export type Col<T> = { label: string; cell: (r: T) => ReactNode; right?: boolean };
/** Fixed-height scroll box. Wide table from md up; stacked label/value rows on a phone. */
export function Table<T>({ cols, rows, empty = "Nothing yet", height = "max-h-[420px]", rowKey }: { cols: Col<T>[]; rows: T[]; empty?: string; height?: string; rowKey: (r: T) => string }) {
  if (!rows.length) return <p className="note text-mute">{empty}</p>;
  return (
    <div className={`${height} overflow-auto rounded-[4px] border border-hairsoft`}>
      <table className="hidden w-full text-left text-[14px] md:table">
        <thead className="sticky top-0 bg-inktint"><tr>{cols.map((c) => <th key={c.label} className={`note px-3 py-2 font-medium text-mute ${c.right ? "text-right" : ""}`}>{c.label}</th>)}</tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={rowKey(r)} className="border-t border-hairsoft">{cols.map((c) => <td key={c.label} className={`num px-3 py-2 ${c.right ? "text-right" : ""}`}>{c.cell(r)}</td>)}</tr>
        ))}</tbody>
      </table>
      <ul className="divide-y divide-hairsoft md:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)} className="space-y-1 px-3 py-3 text-[14px]">
            {cols.map((c) => <div key={c.label} className="flex justify-between gap-4"><span className="note text-mute">{c.label}</span><span className="num min-w-0 break-words text-right">{c.cell(r)}</span></div>)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Tag({ children, warn }: { children: ReactNode; warn?: boolean }) {
  return <span className={`note rounded-[4px] px-2 py-1 ${warn ? "bg-signaltint text-deep" : "bg-inktint text-ink"}`}>{children}</span>;
}
