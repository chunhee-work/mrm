import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/brand-mark";
import { requireAdmin } from "@/lib/admin/auth";
import { day, int, words } from "@/lib/admin/format";
import type { Scope } from "@/lib/admin/queries";
import {
  IconBack, IconCases, IconCost, IconErrors, IconExit, IconHealth, IconInfo, IconNext, IconOk, IconOverview, IconTodo, IconUsers,
} from "./_icons";

export type Sp = Promise<{ [k: string]: string | string[] | undefined }>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
export async function readSp(sp: Sp) {
  const s = await sp;
  const scope: Scope = { includeInternal: one(s.internal) === "1" };
  return { scope, q: one(s.q) ?? "", page: Math.min(100000, Math.max(0, Math.floor(Number(one(s.page))) || 0)) }; // "1e400" or "-1" in the address must not reach SQL
}
export const withScope = (href: string, scope: Scope) => (scope.includeInternal ? `${href}?internal=1` : href);

export { ago, day, int, usd, when, words } from "@/lib/admin/format";

// ---- case status: the same words the adjuster sees in the app ----
const STATUS: Record<string, { label: string; tone: "run" | "wait" | "done" | "fail" }> = {
  uploaded: { label: "Uploaded", tone: "run" },
  reading: { label: "Reading documents", tone: "run" },
  naming: { label: "Naming photos", tone: "run" },
  phase_a: { label: "Creating case", tone: "run" },
  waiting_user: { label: "Waiting for user", tone: "wait" },
  phase_b: { label: "Entering parts & labour", tone: "run" },
  checking: { label: "Checking", tone: "run" },
  pending_doc: { label: "Missing document", tone: "wait" },
  done: { label: "Done", tone: "done" },
  failed: { label: "Failed", tone: "fail" },
};
const STATUS_ORDER = Object.keys(STATUS);
const TONE = { run: "bg-scan", wait: "border-2 border-amber", done: "bg-go", fail: "bg-amber" } as const;
const statusOf = (s: string | null) => STATUS[s ?? ""] ?? { label: words(s), tone: "run" as const };

export function Status({ s }: { s: string | null }) {
  const st = statusOf(s);
  return <span className="status"><span className={`status-dot ${TONE[st.tone]}`} aria-hidden="true" /><span className="font-sans text-[14px]">{st.label}</span></span>;
}

/** Cases per status as bars, in pipeline order: the longest bar is where the cases are. */
export function StatusBars({ rows }: { rows: { status: string; n: number }[] }) {
  if (!rows.length) return <Empty>No cases yet</Empty>;
  const max = Math.max(1, ...rows.map((r) => r.n));
  const sorted = [...rows].sort((a, b) => (STATUS_ORDER.indexOf(a.status) + 99) % 99 - (STATUS_ORDER.indexOf(b.status) + 99) % 99);
  return (
    <ul className="space-y-2.5">
      {sorted.map((r) => {
        const st = statusOf(r.status);
        return (
          <li key={r.status} className="grid grid-cols-[minmax(0,11rem)_1fr_3rem] items-center gap-3 text-[14px]">
            <Status s={r.status} />
            <span className="h-2 rounded-[2px] bg-panel2"><span className={`block h-2 rounded-[2px] ${st.tone === "done" ? "bg-go" : st.tone === "run" ? "bg-scan" : "bg-amber"}`} style={{ width: `${(r.n / max) * 100}%` }} /></span>
            <span className="num text-right font-medium">{int(r.n)}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ---- frame ----
const NAV = [
  ["", "Overview", IconOverview], ["todo", "To-do", IconTodo], ["users", "Users", IconUsers], ["cost", "Cost", IconCost],
  ["cases", "Cases", IconCases], ["errors", "Errors", IconErrors], ["health", "Health", IconHealth],
] as const;

function TestToggle({ scope }: { scope: Scope }) {
  const on = scope.includeInternal;
  return (
    <Link href={on ? "?" : "?internal=1"} role="switch" aria-checked={on} title="Count the owner and smoke-test accounts too"
      className="flex h-9 shrink-0 items-center gap-2.5 text-[13px] font-medium text-mute hover:text-fg">
      Test accounts
      <span className={`relative h-5 w-9 rounded-full transition-colors ${on ? "bg-ice" : "bg-hair2"}`} aria-hidden="true">
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-panel transition-[left] ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </Link>
  );
}

export async function Shell({ current, scope, title, back, children }: { current: string; scope: Scope; title: ReactNode; back?: { href: string; label: string }; children: ReactNode }) {
  await requireAdmin();
  const href = (slug: string) => withScope(`/admin${slug ? "/" + slug : ""}`, scope);
  const brand = (
    <Link href={href("")} className="flex items-center gap-2.5 lg:flex-col lg:items-start lg:gap-2">
      <Brand />
      <span className="note rounded-[3px] border border-hair bg-transparent px-1.5 py-0.5 font-medium uppercase text-mute">Admin</span>
    </Link>
  );
  const exit = (
    <Link href="/dashboard" title="Back to the app" className="flex h-10 items-center gap-2 rounded-[3px] px-2 text-[14px] font-medium text-mute hover:bg-panel2 hover:text-fg">
      <IconExit /><span className="hidden xl:inline">Exit admin</span>
    </Link>
  );
  const head = (
    <div className="mb-5 flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        {back ? <Link href={back.href} className="mb-1 flex items-center gap-1.5 text-[13px] font-medium text-mute hover:text-fg"><IconBack size={14} />{back.label}</Link> : null}
        <h1 className="display-3 truncate text-[24px] text-fg">{title}</h1>
      </div>
      <TestToggle scope={scope} />
    </div>
  );

  // A side rail on a computer; on a phone the seven tabs sit in a bar under the thumb and stay there while the page scrolls.
  return (
    <div className="theme-light min-h-screen bg-bay text-fg lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="border-b border-hair bg-panel lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex h-[60px] items-center justify-between px-4 lg:h-auto lg:px-5 lg:pb-3 lg:pt-5">{brand}<span className="lg:hidden">{exit}</span></div>
        <nav aria-label="Admin" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-7 border-t border-hair bg-panel pb-[env(safe-area-inset-bottom)] lg:static lg:mt-2 lg:block lg:border-t-0 lg:px-3">
          {NAV.map(([slug, label, Icon]) => (
            <Link key={slug} href={href(slug)} aria-current={current === slug ? "page" : undefined}
              className={`flex flex-col items-center gap-1 py-2 text-[11px] font-medium lg:mb-0.5 lg:h-11 lg:flex-row lg:gap-3 lg:rounded-[3px] lg:px-3 lg:py-0 lg:text-[15px] ${current === slug ? "text-ice lg:bg-ice lg:text-bay" : "text-mute hover:text-fg lg:hover:bg-panel2"}`}>
              <Icon />{label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden border-t border-hair p-3 lg:block">
          <form method="POST" action="/api/admin/logout">
            <button type="submit" className="flex h-10 w-full items-center gap-2 rounded-[3px] px-2 text-[14px] font-medium text-mute hover:bg-panel2 hover:text-fg"><IconExit /><span className="hidden xl:inline">Sign out</span></button>
          </form>
          {exit}
        </div>
      </aside>
      <main id="main" className="min-w-0 px-4 pb-24 pt-5 sm:px-8 lg:pb-10 lg:pt-7">{head}{children}</main>
    </div>
  );
}

// ---- blocks ----
export function Empty({ children, ok }: { children: ReactNode; ok?: boolean }) {
  return <p className={`flex items-center gap-2 py-1 text-[14px] ${ok ? "text-go" : "text-mute"}`}>{ok ? <IconOk /> : null}{children}</p>;
}

/** One number. With `href` the whole tile is the way to its page. `alert` is the amber line under the number. */
export function Stat({ icon, label, value, sub, alert, href }: { icon?: ReactNode; label: string; value: string; sub?: string; alert?: string | false; href?: string }) {
  const body = (
    <>
      <p className="flex items-center gap-2 text-[13px] font-medium text-mute">{icon}{label}{href ? <IconNext size={14} className="ml-auto opacity-0 transition-opacity group-hover:opacity-100" /> : null}</p>
      <p className="num display-3 mt-2 text-[30px] leading-none text-fg">{value}</p>
      {alert ? <p className="mt-2.5 flex items-center gap-1.5 text-[13px] font-medium text-amber"><span className="h-1.5 w-1.5 rounded-full bg-amber" aria-hidden="true" />{alert}</p>
        : sub ? <p className="mt-2.5 text-[13px] text-mute">{sub}</p> : null}
    </>
  );
  const box = "block rounded-[4px] border border-hair bg-panel p-4";
  return href ? <Link href={href} className={`group ${box} transition-colors hover:border-ice`}>{body}</Link> : <div className={box}>{body}</div>;
}

export function Card({ icon, title, count, children, info }: { icon?: ReactNode; title: string; count?: number; children: ReactNode; /** the fine print, folded behind an (i) */ info?: ReactNode }) {
  return (
    <section className="rounded-[4px] border border-hair bg-panel p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-mute">{icon}</span>
        <h2 className="display-3 text-[17px] text-fg">{title}</h2>
        {count ? <span className="num rounded-full bg-ambertint px-2 py-0.5 text-[12px] font-semibold text-amber">{int(count)}</span> : null}
        {info ? (
          <details className="group/info relative ml-auto">
            <summary aria-label={`About ${title}`} className="flex h-7 w-7 items-center justify-center rounded-full text-mute hover:bg-panel2 hover:text-fg"><IconInfo /></summary>
            <div className="menu absolute right-0 top-9 z-30 w-[min(320px,80vw)] rounded-[4px] border border-hair bg-panel p-3 text-[13px] leading-relaxed text-mute">{info}</div>
          </details>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function Bars({ data, label, fmt = (n: number) => String(n) }: { data: { date: string; v: number }[]; label: string; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.v));
  const peak = Math.max(0, ...data.map((d) => d.v));
  const w = 600, h = 120, bw = w / Math.max(1, data.length);
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} preserveAspectRatio="none" className="h-32 w-full">
        <line x1="0" y1={h - 0.5} x2={w} y2={h - 0.5} className="stroke-hair" />
        {data.map((d, i) => (
          <rect key={d.date} x={i * bw + 2} y={h - (d.v / max) * (h - 6)} width={Math.max(1, bw - 4)} height={(d.v / max) * (h - 6)} className="fill-scan" opacity={d.v ? 1 : 0.15}>
            <title>{`${day(d.date)}: ${fmt(d.v)}`}</title>
          </rect>
        ))}
      </svg>
      <p className="num mt-1.5 flex justify-between text-[12px] text-mute"><span>{day(data[0]?.date)}</span><span>peak {fmt(peak)}</span><span>{day(data[data.length - 1]?.date)}</span></p>
    </div>
  );
}

export type Col<T> = { label: string; cell: (r: T) => ReactNode; right?: boolean };
/** Fixed-height scroll box. A table from md up; on a phone each row is a small card: the first column is its title. */
export function Table<T>({ cols, rows, empty = "Nothing yet", ok, height = "max-h-[420px]", rowKey }: { cols: Col<T>[]; rows: T[]; empty?: string; /** an empty list is good news */ ok?: boolean; height?: string; rowKey: (r: T) => string }) {
  if (!rows.length) return <Empty ok={ok}>{empty}</Empty>;
  const [first, ...rest] = cols;
  return (
    <div className={`${height} app-scroll overflow-auto rounded-[4px] border border-hairsoft`}>
      <table className="hidden w-full text-left text-[14px] md:table">
        <thead className="sticky top-0 z-10 bg-panel2"><tr>{cols.map((c) => <th key={c.label} className={`whitespace-nowrap px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-mute ${c.right ? "text-right" : ""}`}>{c.label}</th>)}</tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={rowKey(r)} className="border-t border-hairsoft hover:bg-bay">{cols.map((c) => <td key={c.label} className={`num px-3 py-2.5 align-middle ${c.right ? "text-right" : ""}`}>{c.cell(r)}</td>)}</tr>
        ))}</tbody>
      </table>
      <ul className="divide-y divide-hairsoft md:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)} className="px-3 py-3 text-[14px]">
            <div className="num min-w-0 break-words font-medium">{first.cell(r)}</div>
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {rest.map((c) => <div key={c.label} className="contents"><dt className="text-[13px] text-mute">{c.label}</dt><dd className="num min-w-0 break-words text-right">{c.cell(r)}</dd></div>)}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Tag({ children, warn }: { children: ReactNode; warn?: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold ${warn ? "bg-ambertint text-amber" : "bg-gotint text-go"}`}>{children}</span>;
}
/** A tick or a cross with the word next to it. */
export function Check({ ok, children }: { ok: boolean; children?: ReactNode }) {
  return <span className={`inline-flex items-center gap-1.5 ${ok ? "text-go" : "text-amber"}`}>{ok ? <IconOk /> : <IconErrors />}{children ? <span className="text-[14px] font-medium">{children}</span> : null}</span>;
}
/** The short case number, in the mono face. */
export const CaseId = ({ id }: { id: string | null | undefined }) => <span className="font-mono text-[13px] text-mute">{id ? id.slice(0, 8) : "–"}</span>;

export type Todo = { n: number; text: string; href: string; icon: ReactNode };
/** What needs a look, one line each, each line the way to its page. Nothing to do reads as one green line. */
export function Attention({ items }: { items: Todo[] }) {
  const open = items.filter((i) => i.n > 0);
  if (!open.length) return <div className="flex items-center gap-2.5 rounded-[4px] border border-go/40 bg-gotint px-4 py-3 text-[15px] font-medium text-go"><IconOk />All clear</div>;
  return (
    <ul className="divide-y divide-hairsoft overflow-hidden rounded-[4px] border border-amber/50 bg-panel">
      {open.map((i) => (
        <li key={i.text}>
          <Link href={i.href} className="group flex h-12 items-center gap-3 px-4 text-[15px] hover:bg-ambertint">
            <span className="text-amber">{i.icon}</span>
            <span className="num w-8 font-semibold">{int(i.n)}</span>
            <span className="min-w-0 flex-1 truncate">{i.text}</span>
            <IconNext size={16} className="text-mute group-hover:text-fg" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
