"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Cross, Plus, Tick } from "@/components/app/marks";
import { canonName, inList, PART_NAMES } from "@/lib/photos/rules";
import type { Extra } from "@/lib/photos/desk-rules";
import type { PT } from "@/lib/photos/strings";

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-[2px] border border-hair bg-panel2 px-1.5 font-mono text-[11.5px] text-fg">{children}</kbd>
);

/** A dialog over the desk. `place` = where it sits: top (palette), bottom (phone sheet) or centre. Escape and a press on the dark area close it. */
function Sheet({ label, place, onClose, children }: { label: string; place: "top" | "bottom" | "center"; onClose: () => void; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  // R3-B05: onClose is a new function on every render of the desk. In the effect's dependencies it re-ran the cleanup (which gives the focus back
  // to the page) each time a part was added, so the palette lost its cursor. Held in a ref, the effect runs once.
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== "Tab" || !box.current) return;
      const f = box.current.querySelectorAll<HTMLElement>("button:not([disabled]), input, [tabindex='0']");
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); before?.focus?.({ preventScroll: true }); };
  }, []);
  const pos = place === "top" ? "items-start justify-center px-3 pt-[10vh]" : place === "bottom" ? "items-end justify-center sm:items-center sm:px-4" : "items-center justify-center px-3";
  return (
    <div className={`fixed inset-0 z-50 flex bg-[#04060A]/75 ${pos}`} onPointerDown={(e) => { if (e.target === e.currentTarget) closeRef.current(); }}>
      <div
        ref={box} role="dialog" aria-modal="true" aria-label={label}
        className={`relative flex max-h-[80dvh] w-full flex-col border border-hair bg-panel shadow-[0_24px_48px_-24px_rgba(0,0,0,0.9)] motion-safe:animate-[deskrise_0.18s_ease-out] ${place === "bottom" ? "max-w-[520px] rounded-t-[3px] pb-[env(safe-area-inset-bottom)] sm:rounded-[3px]" : "max-w-[560px] rounded-[3px]"}`}
      >
        <span className="scan-edge" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

// ───────────── parts with no photo: the Space palette ─────────────
export function Palette({ extras, photoNames, onAdd, onRemove, onClose, t }: {
  extras: Extra[]; photoNames: Set<string>; onAdd: (name: string) => void | Promise<void>; onRemove: (e: Extra) => void; onClose: () => void; t: PT;
}) {
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const have = useMemo(() => new Set(extras.map((e) => e.name.toLowerCase())), [extras]);

  const rows = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [] as { name: string; custom: boolean }[];
    const hit = PART_NAMES.filter((n) => { const l = n.toLowerCase(); return words.every((w) => l.includes(w)); });
    const first = words[0];
    hit.sort((a, b) => Number(!a.toLowerCase().startsWith(first)) - Number(!b.toLowerCase().startsWith(first)) || a.length - b.length);
    const out = hit.slice(0, 40).map((name) => ({ name, custom: false }));
    const typed = canonName(q);
    if (typed && !inList(typed)) out.push({ name: typed, custom: true });
    return out;
  }, [q]);

  useEffect(() => { setAt(0); }, [q]);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${at}"]`)?.scrollIntoView({ block: "nearest" }); }, [at]);

  // the cursor goes back to the box at once and again when the save returns (R3-B05)
  const add = (name: string) => {
    setQ(""); input.current?.focus();
    if (have.has(name.toLowerCase())) return;
    void Promise.resolve(onAdd(name)).finally(() => input.current?.focus());
  };

  return (
    <Sheet label={t("pal.title")} place="top" onClose={onClose}>
      <div className="flex items-center gap-3 border-b border-hair px-3.5">
        <Plus className="shrink-0 text-ice" />
        <input
          ref={input} value={q} onChange={(e) => setQ(e.target.value)}
          role="combobox" aria-expanded={rows.length > 0} aria-controls="desk-pal-list" aria-autocomplete="list"
          aria-activedescendant={rows.length ? `desk-pal-${at}` : undefined}
          aria-label={t("pal.title")} placeholder={t("pal.placeholder")} maxLength={120}
          autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="done"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setAt((v) => Math.min(rows.length - 1, v + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setAt((v) => Math.max(0, v - 1)); }
            else if (e.key === "Enter") { e.preventDefault(); if (rows[at]) add(rows[at].name); }
          }}
          className="h-[52px] min-w-0 flex-1 bg-transparent text-[16px] text-fg outline-none placeholder:text-mute/60"
        />
        <button type="button" onClick={onClose} aria-label={t("close")} className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center text-mute transition-colors hover:text-ice"><Cross /></button>
      </div>

      <div ref={list} id="desk-pal-list" role="listbox" aria-label={t("pal.title")} className="app-scroll h-[min(42dvh,340px)] overflow-y-auto overscroll-contain p-1.5">
        {rows.length === 0 && (
          <p className="px-2.5 py-3 text-[14px] text-mute">{q.trim() ? t("pal.none") : t("pal.stays")}</p>
        )}
        {rows.map((r, i) => {
          const added = have.has(r.name.toLowerCase());
          const onPhoto = photoNames.has(r.name);
          return (
            <button
              key={r.custom ? `c:${r.name}` : r.name} id={`desk-pal-${i}`} data-i={i} type="button" role="option" aria-selected={i === at}
              onPointerMove={() => { if (at !== i) setAt(i); }}
              onClick={() => add(r.name)}
              className={`flex min-h-[44px] w-full items-center justify-between gap-3 rounded-[2px] px-2.5 py-2 text-left text-[15px] leading-snug ${i === at ? "bg-icetint text-ice" : "text-fg"}`}
            >
              <span className="min-w-0 [overflow-wrap:anywhere]">{r.custom ? t("pal.custom", { name: r.name }) : r.name}</span>
              {added ? <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11.5px] text-go"><Tick className="h-3.5 w-3.5" />{t("pal.added")}</span>
                : onPhoto ? <span className="shrink-0 font-mono text-[11.5px] text-amber">{t("pal.onPhoto")}</span> : null}
            </button>
          );
        })}
      </div>

      {extras.length > 0 && (
        <div className="app-scroll flex max-h-[84px] flex-wrap gap-1.5 overflow-y-auto border-t border-hair px-3 py-2.5">
          {extras.map((e) => <ExtraChip key={e.id} e={e} onRemove={onRemove} t={t} />)}
        </div>
      )}
      <div className="hidden items-center gap-4 border-t border-hair px-3.5 py-2.5 text-[12.5px] text-mute sm:flex">
        <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd>{t("pal.hint.move")}</span>
        <span className="flex items-center gap-1.5"><Kbd>Enter</Kbd>{t("pal.hint.add")}</span>
        <span className="flex items-center gap-1.5"><Kbd>Esc</Kbd>{t("pal.hint.close")}</span>
      </div>
    </Sheet>
  );
}

export function ExtraChip({ e, onRemove, t }: { e: Extra; onRemove: (e: Extra) => void; t: PT }) {
  return (
    <span className="inline-flex h-8 shrink-0 items-center rounded-[3px] border border-hair bg-panel2 pl-2.5 text-[13px] font-medium text-fg">
      <span className="max-w-[220px] truncate">{e.name}</span>
      <button type="button" aria-label={t("removePart", { name: e.name })} onClick={() => onRemove(e)} className="flex h-8 w-8 items-center justify-center text-mute transition-colors hover:text-amber">
        <Cross className="h-3 w-3" />
      </button>
    </span>
  );
}

// ───────────── move a photo (touch, and the keyboard way to reorder) ─────────────
export function MoveSheet({ n, total, name, src, onMove, onClose, t }: {
  n: number; total: number; name: string | null; src: string; onMove: (to: number) => void; onClose: () => void; t: PT;
}) {
  const [to, setTo] = useState(String(n));
  const target = Math.min(total, Math.max(1, Math.round(Number(to)) || n));
  const step = "flex h-12 items-center justify-center rounded-[3px] border border-hair text-[15px] font-semibold text-ice transition-colors hover:border-ice active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <Sheet label={t("mv.title")} place="bottom" onClose={onClose}>
      <div className="flex items-center gap-3 border-b border-hair p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="h-[54px] w-[72px] shrink-0 rounded-[2px] object-cover" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[12px] text-mute">{n}/{total}</p>
          <p className="text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">{name ?? t("nameNeeded")}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={t("close")} className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center text-mute hover:text-ice"><Cross /></button>
      </div>
      <div className="app-scroll grid gap-3 overflow-y-auto p-3">
        <form className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2" onSubmit={(e) => { e.preventDefault(); onMove(target - 1); }}>
          <label className="grid gap-1.5 text-[13px] font-semibold text-fg">
            {t("mv.to")}
            <input
              value={to} onChange={(e) => setTo(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
              inputMode="numeric" pattern="[0-9]*" autoComplete="off" onFocus={(e) => e.target.select()}
              className="h-12 w-full rounded-[3px] border border-hair bg-bay px-3 font-mono text-[18px] text-fg outline-none focus:border-ice focus:ring-2 focus:ring-ice/20"
            />
          </label>
          <button type="submit" disabled={target === n} className="btn-primary !px-5 disabled:cursor-not-allowed disabled:opacity-50">{t("mv.go")}</button>
        </form>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={step} disabled={n <= 1} onClick={() => onMove(n - 2)}>{t("mv.up")}</button>
          <button type="button" className={step} disabled={n >= total} onClick={() => onMove(n)}>{t("mv.down")}</button>
          <button type="button" className={step} disabled={n <= 1} onClick={() => onMove(0)}>{t("mv.first")}</button>
          <button type="button" className={step} disabled={n >= total} onClick={() => onMove(total - 1)}>{t("mv.last")}</button>
        </div>
      </div>
    </Sheet>
  );
}

// ───────────── shortcuts and legend ─────────────
export function HelpSheet({ onClose, t }: { onClose: () => void; t: PT }) {
  const keys: [React.ReactNode, string][] = [
    [<><Kbd>K</Kbd><Kbd>↓</Kbd></>, t("h.next")],
    [<><Kbd>J</Kbd><Kbd>↑</Kbd></>, t("h.prev")],
    [<><Kbd>1</Kbd><Kbd>2</Kbd><Kbd>3</Kbd></>, t("h.alt")],
    [<Kbd>E</Kbd>, t("h.edit")],
    [<Kbd>C</Kbd>, t("h.copy")],
    [<Kbd>V</Kbd>, t("h.paste")],
    [<><Kbd>Enter</Kbd><Kbd>Enter</Kbd></>, t("h.done")],
    [<><Kbd>⌘Z</Kbd><Kbd>Ctrl Z</Kbd></>, t("h.undo")],
    [<><Kbd>←</Kbd><Kbd>→</Kbd></>, t("h.case")],
    [<Kbd>Space</Kbd>, t("h.part")],
    [<Kbd>?</Kbd>, t("h.help")],
  ];
  const mark = "inline-flex h-6 items-center rounded-[2px] px-2 font-mono text-[11.5px] font-semibold";
  return (
    <Sheet label={t("help")} place="center" onClose={onClose}>
      <div className="flex items-center justify-between border-b border-hair py-1 pl-4 pr-1.5">
        <h2 className="display-3 text-[17px]">{t("help")}</h2>
        <button type="button" onClick={onClose} aria-label={t("close")} className="flex h-11 w-11 items-center justify-center text-mute hover:text-ice"><Cross /></button>
      </div>
      <div className="app-scroll overflow-y-auto">
        <dl className="hidden px-4 py-2 lg:block">
          {keys.map(([k, label], i) => (
            <div key={i} className="flex items-center justify-between gap-4 border-b border-hairsoft py-2 last:border-0">
              <dt className="text-[14.5px] text-fg">{label}</dt>
              <dd className="flex shrink-0 gap-1">{k}</dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-hair px-4 py-3">
          <h3 className="mb-2.5 font-mono text-[11.5px] uppercase tracking-wider text-mute">{t("legend")}</h3>
          <ul className="grid gap-2 text-[14px] text-fg">
            <li className="flex items-center gap-3"><span className={`${mark} bg-bay text-go`}>96%</span>{t("lg.sure")}</li>
            <li className="flex items-center gap-3"><span className={`${mark} bg-amber text-bay`}>72%</span>{t("lg.low")}</li>
            <li className="flex items-center gap-3"><span className={`${mark} border border-ice/70 uppercase text-ice`}>{t("fixed")}</span>{t("lg.fixed")}</li>
            <li className="flex items-center gap-3"><span className={`${mark} bg-ice text-bay`}>{t("edited")}</span>{t("lg.edited")}</li>
          </ul>
        </div>
      </div>
    </Sheet>
  );
}
