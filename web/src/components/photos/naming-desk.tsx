"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/components/lang-provider";
import CaseSteps from "@/components/app/case-steps";
import { Chevron, Plus, Tick, UploadArt } from "@/components/app/marks";
import {
  classifyPaste, counts, isEnterPair, moved, nextUnnamed, shownName, visible, UndoStack,
  type CaseState, type Extra, type Filter, type Photo,
} from "@/lib/photos/desk-rules";
import { canonName, inList, MAX_EXTRAS, PART_NAMES } from "@/lib/photos/rules";
import { photoT } from "@/lib/photos/strings";
import { whenOf } from "@/lib/fmt-when";
import { PhotoCard, type CardActions, type Editing } from "./photo-card";
import { ExtraChip, HelpSheet, MoveSheet, Palette } from "./sheets";
import { uploadPhotos } from "./upload";
import { loginUrl } from "@/lib/next-path";

/** `at` = when the case was uploaded (ISO); `dup` = another tab has the same plate, so the time tells them apart (shown in the page language, R3-B08). */
export type DeskTab = { id: string; plate: string; carModel: string | null; done: boolean; photos: number; at: string; dup: boolean; edited: number; workshop?: string | null };
type Reply = { ok: boolean; status: number; body: Record<string, unknown> };

/** `ms`: give up after this long (the caller then reads what the server holds), for a request the page waits on. */
async function api(method: string, url: string, body?: unknown, ms?: number): Promise<Reply> {
  try {
    const r = await fetch(url, {
      method, cache: "no-store", signal: ms ? AbortSignal.timeout(ms) : undefined,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    // hard test 2026-11-22: signed out in another tab (or the session ran out): say so once, instead of "could not save" on every change
    if (r.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event("desk:signed-out"));
    return { ok: r.ok, status: r.status, body: j };
  } catch {
    return { ok: false, status: 0, body: {} };
  }
}
/** An edit the server refused because the case is past Phase B says so, instead of "could not save". */
const failKey = (r: Reply, other = "saveFailed") => (r.body.error === "status" ? "block.status" : other);
const uid = () => Math.random().toString(36).slice(2);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// A naming call that failed is tried again by the page itself, a little later each time. Nothing is said about it.
const RETRY_WAITS = [1500, 6000, 15_000];
/** A photo the naming call failed on, which a second try could still name: not named by hand, and not stopped by the cost limit. */
const canRetry = (p: Photo) => p.state === "failed" && !p.finalName && p.error !== "cost limit reached";

/**
 * The case tabs (owner 2026-11-22: "the car plate ui need to stand more out", "the black change ui not match"): each case
 * is a number plate. The open one is a black plate with white letters, the others white with a line round them. The plate
 * is bold and 15.5px; "n changed" is a soft round label, never a black block.
 */
const TAB = {
  base: "flex h-10 shrink-0 items-center gap-2 rounded-[5px] px-3.5 font-mono text-[15.5px] font-bold tracking-[0.06em] transition-colors duration-150",
  here: "bg-ice text-bay",
  rest: "bg-panel text-fg ring-1 ring-inset ring-hair2 hover:bg-panel2",
  badge: "rounded-full px-2 py-[3px] font-sans text-[11.5px] font-semibold leading-none tracking-normal",
};

/**
 * The photo naming desk. One page for every open case: tabs across the top, the photos of the current case in a
 * two-column grid that scrolls inside its own frame. Every change saves at once and is taken back if the save fails.
 */
/**
 * `embedded`: the desk opened inside a line of the first page (owner 2026-11-27: "all done in the first page, never jump to other pages").
 * One case, no tab strip, no step bar (the line has one), the page address is left alone, keys work only while the focus is inside
 * the desk, and the photos scroll in a box of their own. `onDone` runs after 完成 went through, so the first page reads the case again.
 */
export default function NamingDesk({ orgId, tabs: firstTabs, initialId, initial, embedded = false, onDone }: { orgId: string; tabs: DeskTab[]; initialId: string; initial?: CaseState; embedded?: boolean; onDone?: () => void }) {
  const { lang } = useT();
  const t = useMemo(() => photoT(lang), [lang]);
  const tRef = useRef(t); tRef.current = t;

  const [tabs, setTabs] = useState(firstTabs);
  const [caseId, setCaseId] = useState(initialId);
  const caseRef = useRef(caseId); caseRef.current = caseId;
  const [states, setStatesRaw] = useState<Record<string, CaseState>>(() => (initial ? { [initialId]: initial } : {})); // the open case came with the page
  const statesRef = useRef(states);
  const mutate = useCallback((fn: (s: Record<string, CaseState>) => Record<string, CaseState>) => {
    const next = fn(statesRef.current);
    statesRef.current = next;
    setStatesRaw(next);
  }, []);
  const [loadFailed, setLoadFailed] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  useEffect(() => {
    const out = () => setSignedOut(true);
    window.addEventListener("desk:signed-out", out);
    return () => window.removeEventListener("desk:signed-out", out);
  }, []);
  const [filter, setFilter] = useState<Filter>("all");
  const filterRef = useRef<Filter>("all");
  const [frozen, setFrozen] = useState<number[] | null>(null);
  const [cur, setCur] = useState<number | null>(null);
  const curRef = useRef(cur); curRef.current = cur;
  // `orig` = the name the photo had when the box opened (what Escape goes back to)
  const [editing, setEditingRaw] = useState<(Editing & { guard?: string; orig: string | null }) | null>(null);
  const editingRef = useRef(editing);
  const setEditing = useCallback((e: (Editing & { guard?: string; orig: string | null }) | null) => { editingRef.current = e; setEditingRaw(e); }, []);
  const [toast, setToast] = useState<{ msg: string; key: number; action?: { label: string; run: () => void } } | null>(null);
  const [hl, setHl] = useState<number | null>(null); // the unnamed photo the last 完成 click jumped to
  const hlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastJump = useRef<number | null>(null);
  const lastEnter = useRef(0); // Enter, Enter within 700 ms = 完成 and on to the next case
  const focusName = useRef<(id: number) => void>(() => {});
  const [palette, setPalette] = useState(false);
  const [moveId, setMoveId] = useState<number | null>(null);
  const [help, setHelp] = useState(false);
  const [up, setUp] = useState<{ done: number; total: number } | null>(null);
  const upRef = useRef(false); // set at once (state waits for a render): two quick drops cannot both start
  const [capped, setCapped] = useState<Record<string, boolean>>({});
  const [flashId, setFlashId] = useState<number | null>(null);
  const [shown, setShown] = useState(true); // browser tab visible
  const [kick, setKick] = useState(0);
  // quiet second tries of photos the model call failed on, per case, this visit (the page never shows a failure line)
  const [tries, setTries] = useState<Record<string, number>>({});
  const triesRef = useRef(tries); triesRef.current = tries;

  const server = useRef(new Map<number, Photo>()); // last row the server confirmed, per photo
  const writes = useRef(new Map<number, { busy: boolean; next?: { target: string | null; session?: string } }>());
  const order = useRef(new Map<string, { busy: boolean; next: boolean }>()); // one saving queue per case
  const undo = useRef(new UndoStack());
  // Saves of a case that are on their way (names, order, parts, undo). 完成 waits for them; `n` counts every one that was started.
  const flying = useRef(new Map<string, { n: number; set: Set<Promise<unknown>> }>());
  const track = useCallback(<T,>(cid: string, p: Promise<T>): Promise<T> => {
    let f = flying.current.get(cid);
    if (!f) { f = { n: 0, set: new Set() }; flying.current.set(cid, f); }
    const q = f;
    q.n++;
    q.set.add(p);
    const off = () => { q.set.delete(p); };
    p.then(off, off);
    return p;
  }, []);
  /** Waits until no save of the case is on its way. Not for ever: a request that hangs must not leave 完成 dead (20 s, then go on). */
  const settle = useCallback(async (cid: string) => {
    const all = (async () => { for (let f = flying.current.get(cid); f && f.set.size;) await Promise.allSettled([...f.set]); })();
    await Promise.race([all, sleep(20_000)]);
  }, []);
  const started = (cid: string) => flying.current.get(cid)?.n ?? 0;
  const inFlight = (cid: string) => flying.current.get(cid)?.set.size ?? 0;
  // `tick` numbers the answers in the order they were asked for. `shownAt` = per case, the newest answer the page already shows: a load
  // that was asked for before it is out of date (a save of this page, or a later load, came back first) and must not be put on the page.
  const tick = useRef(0);
  const shownAt = useRef(new Map<string, number>());
  const touch = useCallback((cid: string) => { shownAt.current.set(cid, ++tick.current); }, []);
  const doneBusy = useRef(false); // one 完成 at a time: a second press while the first is on its way would turn it straight back
  const clip = useRef("");
  const dragId = useRef<number | null>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone); onDoneRef.current = onDone; // the first page passes a new function each render
  // embedded: the last press on the page was inside this desk (its keys follow it, its drops add photos)
  const active = useRef(false);
  useEffect(() => {
    if (!embedded) return;
    const down = (e: PointerEvent) => { active.current = !!root.current?.contains(e.target as Node); };
    window.addEventListener("pointerdown", down, true);
    return () => window.removeEventListener("pointerdown", down, true);
  }, [embedded]);
  const tabStrip = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const raw = states[caseId];
  // while second tries are left, a photo whose naming call failed is still "being named" for the page
  const retrying = !capped[caseId] && (tries[caseId] ?? 0) < RETRY_WAITS.length;
  const st = useMemo(
    () => (raw && retrying && raw.photos.some(canRetry) ? { ...raw, photos: raw.photos.map((p) => (canRetry(p) ? { ...p, state: "pending" } : p)) } : raw),
    [raw, retrying],
  );
  const tab = tabs.find((x) => x.id === caseId);
  const tabsRef = useRef(tabs); tabsRef.current = tabs;

  const say = useCallback((msg: string, action?: { label: string; run: () => void }) => setToast({ msg, key: Date.now(), action }), []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.action ? 8000 : Math.min(7000, 2600 + toast.msg.length * 40));
    return () => clearTimeout(id);
  }, [toast]);

  const patchCase = useCallback((cid: string, fn: (c: CaseState) => CaseState) => {
    mutate((s) => (s[cid] ? { ...s, [cid]: fn(s[cid]) } : s));
  }, [mutate]);
  const patchPhoto = useCallback((cid: string, id: number, fn: (p: Photo) => Photo) => {
    patchCase(cid, (c) => ({ ...c, photos: c.photos.map((p) => (p.id === id ? fn(p) : p)) }));
  }, [patchCase]);
  const setDoneLocal = useCallback((cid: string, done: boolean) => {
    patchCase(cid, (c) => (c.done === done ? c : { ...c, done }));
    setTabs((ts) => ts.map((x) => (x.id === cid && x.done !== done ? { ...x, done } : x)));
  }, [patchCase]);
  /** R3-U02: an edit after 完成 takes the 完成 back. Say so, so the adjuster knows to press it again. */
  const cancelDone = useCallback((cid: string, first?: string) => {
    if (!statesRef.current[cid]?.done) { if (first) say(first); return; }
    setDoneLocal(cid, false);
    say([first, tRef.current("doneCancelled")].filter(Boolean).join(". "));
  }, [setDoneLocal, say]);
  const disarm = useCallback(() => { lastEnter.current = 0; }, []);

  // ───────────── load / refresh ─────────────
  const load = useCallback(async (cid: string, quiet: boolean) => {
    let fresh: CaseState;
    for (let again = 0; ; again++) {
      const asked = ++tick.current;
      const r = await api("GET", `/api/cases/${cid}/photos`);
      if (!r.ok) { if (!quiet && caseRef.current === cid) setLoadFailed(true); return null; }
      fresh = r.body as unknown as CaseState;
      // out of date (see shownAt): old names, an old order or an old 完成 are not put back on the page. Asked again, twice at most.
      if (asked > (shownAt.current.get(cid) ?? 0)) { shownAt.current.set(cid, asked); break; }
      if (again >= 2) return fresh;
    }
    const old = statesRef.current[cid];
    let photos = fresh.photos.map((p) => {
      if (writes.current.get(p.id)?.busy && old) return old.photos.find((x) => x.id === p.id) ?? p; // a save is on its way: keep what the user sees
      server.current.set(p.id, p);
      return p;
    });
    let rev = fresh.rev;
    if (order.current.get(cid)?.busy && old) {
      const pos = new Map(old.photos.map((p, i) => [p.id, i]));
      photos = [...photos].sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
      rev = old.rev;
    }
    undo.current.sync(cid, fresh.photos, (id) => !!writes.current.get(id)?.busy);
    mutate((s) => ({ ...s, [cid]: { ...fresh, rev, photos } }));
    setTabs((ts) => ts.map((x) => (x.id === cid ? { ...x, done: fresh.done, photos: fresh.photos.length } : x)));
    if (caseRef.current === cid) setLoadFailed(false);
    return fresh;
  }, [mutate]);

  const seeded = useRef(!!initial);
  useEffect(() => {
    if (seeded.current && caseId === initialId && initial) { // the page brought this case: no second request for it
      seeded.current = false;
      for (const p of initial.photos) server.current.set(p.id, p);
      undo.current.sync(initialId, initial.photos, () => false);
      return;
    }
    void load(caseId, false);
  }, [caseId, load, initial, initialId]);
  useEffect(() => {
    const on = () => setShown(document.visibilityState === "visible");
    on();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  // other tabs and other people: look again every 10 s while this tab is in front
  useEffect(() => {
    if (!shown) return;
    const id = setInterval(() => { if (!editingRef.current) void load(caseRef.current, true); }, 10_000);
    return () => clearInterval(id);
  }, [shown, load]);

  // ───────────── naming runs in slices, driven by the page ─────────────
  // `st` counts a photo whose call failed as waiting while second tries are left, so this also runs for those.
  const hasWaiting = !!st && st.photos.some((p) => p.state === "pending" || p.state === "running");
  useEffect(() => {
    if (!hasWaiting || !shown || capped[caseId]) return;
    let stop = false;
    const cid = caseId;
    (async () => {
      let errors = 0;
      let photos = statesRef.current[cid]?.photos ?? [];
      while (!stop) {
        let body: { retryFailed?: true } = {};
        if (!photos.some((p) => p.state === "pending" || p.state === "running")) {
          // nothing is waiting any more. A photo the call failed on gets a quiet second try, a little later each time;
          // after the last one it is simply a photo without a name, which the adjuster names by hand.
          if (!photos.some(canRetry)) return;
          const k = triesRef.current[cid] ?? 0;
          if (k >= RETRY_WAITS.length) return;
          await sleep(RETRY_WAITS[k]);
          if (stop) return;
          triesRef.current = { ...triesRef.current, [cid]: k + 1 };
          setTries((t) => ({ ...t, [cid]: k + 1 }));
          patchCase(cid, (c) => ({ ...c, photos: c.photos.map((p) => (canRetry(p) ? { ...p, state: "pending", error: null } : p)) }));
          body = { retryFailed: true };
        }
        const r = await api("POST", `/api/cases/${cid}/photos/name`, body);
        if (stop) return;
        const fresh = await load(cid, true);
        if (stop) return;
        if (fresh) photos = fresh.photos;
        // the request itself did not go through (offline, a restart): wait longer each time, give up after a while
        if (!r.ok || !fresh) { if (++errors >= 6) return; await sleep(Math.min(30_000, 4000 * 2 ** (errors - 1))); continue; }
        errors = 0;
        if (r.body.capped) { setCapped((c) => ({ ...c, [cid]: true })); return; }
        if (r.body.remaining && !r.body.claimed) await sleep(4000); // another tab, or the on-site model, is naming them
        else if (Number(r.body.failed) > 0 && !r.body.named) await sleep(4000); // the whole slice failed: no paid call straight after it
      }
    })();
    return () => { stop = true; };
  }, [hasWaiting, shown, caseId, capped, load, kick, patchCase]);

  // ───────────── names ─────────────
  const renameNow = useCallback(async (cid: string, id: number, target: string | null, session?: string) => {
    const c = statesRef.current[cid];
    const p = c?.photos.find((x) => x.id === id);
    if (!c || !p) return;
    const w = writes.current.get(id) ?? { busy: false };
    writes.current.set(id, w);
    if (p.finalName === target && !w.busy) return;
    patchPhoto(cid, id, (x) => ({ ...x, finalName: target }));
    if (c.done) cancelDone(cid);
    if (w.busy) { w.next = { target, session }; return; } // latest wins; it goes out when the save in flight returns
    w.busy = true;
    let job: { target: string | null; session?: string } = { target, session };
    for (;;) {
      const base = server.current.get(id) ?? p;
      const r = await api("PATCH", `/api/cases/${cid}/photos/${id}`, { finalName: job.target, version: base.version });
      if (r.ok) {
        const row = r.body.photo as Photo;
        if (row.finalName !== base.finalName) undo.current.push({ caseId: cid, photoId: id, prev: base.finalName, after: row.version, session: job.session }, row.finalName);
        server.current.set(id, row);
        touch(cid);
        if (r.body.done === false) setDoneLocal(cid, false); // a saved name takes 完成 back on the server: the page follows, whatever a load showed in between
        if (w.next) { job = w.next; w.next = undefined; continue; }
        patchPhoto(cid, id, () => row);
        break;
      }
      w.next = undefined;
      if (r.status === 409 && r.body.photo) {
        const row = r.body.photo as Photo;
        server.current.set(id, row);
        touch(cid);
        patchPhoto(cid, id, () => row);
        undo.current.dropPhoto(cid, id);
        say(tRef.current("changedElsewhere"));
        void load(cid, true); // nothing was saved, so a 完成 the page took back at the first key is still on: show what is stored
      } else {
        patchPhoto(cid, id, () => base);
        say(tRef.current(r.body.error === "name" ? "nameTooLong" : failKey(r)));
        w.busy = false;
        void load(cid, true);
      }
      break;
    }
    w.busy = false;
  }, [patchPhoto, cancelDone, setDoneLocal, touch, say, load]);
  const rename = useCallback((cid: string, id: number, target: string | null, session?: string) => track(cid, renameNow(cid, id, target, session)), [track, renameNow]);

  const undoLast = useCallback(async () => {
    const e = undo.current.peek(caseRef.current); // the open case only: Ctrl+Z here never takes back a change made on another case
    if (!e) { say(tRef.current("undoNone")); return; }
    const w = writes.current.get(e.photoId) ?? { busy: false };
    writes.current.set(e.photoId, w);
    if (w.busy) return;
    const base = server.current.get(e.photoId);
    if (!base) { undo.current.dropPhoto(e.caseId, e.photoId); say(tRef.current("undoNone")); return; }
    w.busy = true;
    const r = await track(e.caseId, api("PATCH", `/api/cases/${e.caseId}/photos/${e.photoId}`, { finalName: e.prev, version: base.version }));
    w.busy = false;
    const queued = w.next; // a name picked while the undo was on its way: it goes out next, on top of the undo
    w.next = undefined;
    if (r.ok || (r.status === 409 && r.body.photo)) touch(e.caseId);
    if (r.ok) {
      const row = r.body.photo as Photo;
      undo.current.done(e, row.version);
      server.current.set(row.id, row);
      patchPhoto(e.caseId, row.id, () => row);
      const wasDone = !!statesRef.current[e.caseId]?.done;
      setDoneLocal(e.caseId, false);
      if (caseRef.current === e.caseId) { setCur(row.id); reveal(row.id); }
      say(`${tRef.current("undoDone")}: ${shownName(row) ?? tRef.current("nameNeeded")}${wasDone ? `. ${tRef.current("doneCancelled")}` : ""}`);
    } else if (r.status === 409 && r.body.photo) {
      const row = r.body.photo as Photo;
      server.current.set(row.id, row);
      patchPhoto(e.caseId, row.id, () => row);
      undo.current.dropPhoto(e.caseId, e.photoId);
      say(tRef.current("changedElsewhere"));
    } else {
      say(tRef.current("undoFailed"));
    }
    if (queued) {
      const known = server.current.get(e.photoId);
      if (known) patchPhoto(e.caseId, e.photoId, () => known); // back to what is stored, so the queued name counts as a change
      void rename(e.caseId, e.photoId, queued.target, queued.session);
    }
  }, [patchPhoto, setDoneLocal, say, rename, track, touch]); // eslint-disable-line react-hooks/exhaustive-deps

  const photoOf = (id: number) => statesRef.current[caseRef.current]?.photos.find((x) => x.id === id);

  // ───────────── order ─────────────
  const applyOrder = useCallback((cid: string, next: Photo[]) => {
    patchCase(cid, (c) => ({ ...c, photos: next }));
    cancelDone(cid);
    let q = order.current.get(cid);
    if (!q) { q = { busy: false, next: false }; order.current.set(cid, q); }
    const o = q;
    if (o.busy) { o.next = true; return; }
    o.busy = true;
    void track(cid, (async () => {
      for (;;) {
        o.next = false;
        const c = statesRef.current[cid];
        if (!c) break;
        const r = await api("PUT", `/api/cases/${cid}/photos/order`, { ids: c.photos.map((p) => p.id), rev: c.rev });
        if (r.ok) {
          touch(cid);
          patchCase(cid, (x) => ({ ...x, rev: Number(r.body.rev) }));
          if (r.body.done === false) setDoneLocal(cid, false); // a saved order takes 完成 back on the server: the page follows
          if (o.next) continue;
          break;
        }
        o.busy = false;
        say(tRef.current(failKey(r, r.status === 409 ? "orderElsewhere" : "saveFailed")));
        await load(cid, true);
        return;
      }
      o.busy = false;
    })());
  }, [patchCase, cancelDone, setDoneLocal, track, touch, say, load]);

  function reveal(id: number) {
    requestAnimationFrame(() => {
      const f = frame.current;
      const el = f?.querySelector<HTMLElement>(`[data-pid="${id}"]`);
      if (!f || !el) return;
      const a = el.getBoundingClientRect(), b = f.getBoundingClientRect();
      if (a.top < b.top + 8) f.scrollTop -= b.top + 8 - a.top;
      else if (a.bottom > b.bottom - 8) f.scrollTop += Math.min(a.bottom - b.bottom + 8, a.top - b.top - 8);
    });
  }
  const moveTo = useCallback((id: number, to: number) => {
    const cid = caseRef.current;
    const c = statesRef.current[cid];
    if (!c) return;
    const from = c.photos.findIndex((p) => p.id === id);
    const next = moved(c.photos, from, Math.min(c.photos.length - 1, Math.max(0, to)));
    if (next === c.photos) return;
    applyOrder(cid, next);
    setCur(id);
    setFlashId(id);
    setTimeout(() => setFlashId((v) => (v === id ? null : v)), 950);
    reveal(id);
  }, [applyOrder]);

  // ───────────── done: ONE click. Unnamed photos block it and the page walks you to them ─────────────
  const jumpUnnamed = useCallback(() => {
    const cid = caseRef.current;
    const c = statesRef.current[cid];
    if (!c) return;
    const target = nextUnnamed(c.photos, lastJump.current); // first click: the first unnamed photo; the next click: the next one
    if (!target) return;
    lastJump.current = target.id;
    say(tRef.current("block.unnamed", { n: c.photos.filter((p) => !shownName(p) && p.state !== "pending" && p.state !== "running").length }));
    if (filterRef.current !== "all") pickFilter("all");
    setTimeout(() => {
      const f = frame.current;
      // R3-B11: the name field is put in the middle of the frame (the card is taller than the field, so centring the card left it at the bottom edge)
      const el = f?.querySelector<HTMLElement>(`[data-pid="${target.id}"] [data-pname]`) ?? f?.querySelector<HTMLElement>(`[data-pid="${target.id}"]`);
      if (f && el) {
        const a = el.getBoundingClientRect(), b = f.getBoundingClientRect();
        f.scrollTo({ top: Math.max(0, f.scrollTop + (a.top - b.top) - Math.max(8, (b.height - a.height) / 2)), behavior: "smooth" });
      }
      setCur(target.id);
      setHl(target.id);
      if (hlTimer.current) clearTimeout(hlTimer.current);
      hlTimer.current = setTimeout(() => setHl(null), 3200);
      focusName.current(target.id);
    }, 90);
  }, [say]); // eslint-disable-line react-hooks/exhaustive-deps

  const pressDoneRef = useRef<() => Promise<boolean>>(async () => false);
  const pressDone = useCallback(async (): Promise<boolean> => {
    // one press at a time: a double click (or Enter, Enter twice) would send 完成 twice, and the second one would take it back
    if (doneBusy.current) return false;
    doneBusy.current = true;
    try {
      const cid = caseRef.current;
      const tt = tRef.current;
      if (!statesRef.current[cid]) return false;
      // What is still on its way goes first: a name left in the box, then every save of this case. 完成 is pressed on what is stored;
      // a save that reached the server after it would take it back while the page still said "Finished".
      const e = editingRef.current;
      if (e && !(e.guard !== undefined && e.text === e.guard)) commitEdit(false);
      await settle(cid);
      const c = statesRef.current[cid];
      if (!c || caseRef.current !== cid) return false; // another case was opened while the saves finished
      if (c.done) {
        setDoneLocal(cid, false);
        const r = await api("PUT", `/api/cases/${cid}/photos/done`, { done: false }, 60_000);
        if (r.ok) {
          touch(cid);
          setDoneLocal(cid, false); // again: a load that came back meanwhile may have shown the old "Finished"
          say(tt("undone"), { label: tt("undoAction"), run: () => { setToast(null); void pressDoneRef.current(); } });
          onDoneRef.current?.();
        } else void load(cid, true);
        return false;
      }
      const n = counts(c.photos);
      if (!n.total) { say(tt("block.empty")); return false; }
      if (n.naming) { say(tt("block.naming", { n: n.naming })); return false; }
      if (n.unnamed) { jumpUnnamed(); return false; }
      lastJump.current = null;
      setHl(null);
      const before = started(cid) - inFlight(cid); // a save that is still on its way (it hung past the wait above) counts as racing too
      const r = await api("PUT", `/api/cases/${cid}/photos/done`, { done: true }, 60_000);
      if (r.ok) {
        touch(cid);
        setDoneLocal(cid, true);
        if (typeof r.body.status === "string") patchCase(cid, (x) => ({ ...x, status: String(r.body.status) })); // the card and the step bar follow the new status at once
        // A change sent while 完成 was on its way may have reached the server after it and taken it back. Which came first is
        // only known there: wait for that change, then show what the server holds.
        if (started(cid) !== before) {
          await settle(cid);
          if (!(await load(cid, true))) setDoneLocal(cid, false); // cannot ask: "not done" is the safe thing to show (完成 can be pressed again)
          if (!statesRef.current[cid]?.done) { say(tt("doneCancelled")); onDoneRef.current?.(); return false; }
        }
        const left = tabsRef.current.filter((x) => x.id !== cid && !x.done).length;
        // R3-B02: say what really happens: only a case that is already at the photo step is queued for the worker
        const status = String(statesRef.current[cid]?.status ?? r.body.status ?? "");
        const what = tt(status === "phase_b" ? "doneToast.phase_b" : status === "pending_doc" ? "doneToast.pending_doc" : "doneToast.other", { plate: c.plate });
        say(embedded ? what : left ? what : `${what}. ${tt("allDoneToast")}`);
        onDoneRef.current?.();
        return true;
      }
      const reason = r.body.reason as string | undefined;
      say(r.body.error === "status" ? tt("block.status") : reason ? tt(`block.${reason}`, { n: Number(r.body.count ?? 0) }) : tt("saveFailed"));
      void load(cid, true);
      return false;
    } finally { doneBusy.current = false; }
  }, [setDoneLocal, patchCase, say, load, jumpUnnamed, embedded, settle, touch]); // eslint-disable-line react-hooks/exhaustive-deps
  pressDoneRef.current = pressDone;

  // ───────────── cases ─────────────
  const switchCase = useCallback((id: string) => {
    if (id === caseRef.current) return;
    if (idle.current) clearTimeout(idle.current);
    setEditing(null);
    disarm();
    lastJump.current = null;
    setHl(null);
    setCur(null);
    setMoveId(null);
    setLoadFailed(false);
    setCaseId(id);
    if (!embedded) window.history.replaceState(null, "", `/cases/${id}/photos`);
    if (frame.current) frame.current.scrollTop = 0;
  }, [disarm, setEditing, embedded]);
  const goCase = useCallback((dir: number) => {
    const i = tabs.findIndex((x) => x.id === caseRef.current);
    const next = tabs[i + dir];
    if (next) switchCase(next.id);
  }, [tabs, switchCase]);
  /** R3-B07: Enter, Enter goes to the next case that is not finished yet (wrapping round), not to the next tab. */
  const goNextOpen = useCallback((): boolean => {
    const all = tabsRef.current;
    const i = all.findIndex((x) => x.id === caseRef.current);
    for (let k = 1; k < all.length; k++) {
      const x = all[(i + k) % all.length];
      if (!x.done) { switchCase(x.id); return true; }
    }
    return false;
  }, [switchCase]);

  // ───────────── filter: the cards on screen stay put until the filter is pressed again ─────────────
  function pickFilter(f: Filter) {
    filterRef.current = f;
    setFilter(f);
    const c = statesRef.current[caseRef.current];
    setFrozen(f === "all" || !c ? null : visible(c.photos, f).map((p) => p.id));
    if (frame.current) frame.current.scrollTop = 0;
  }
  useEffect(() => { setFrozen(null); }, [caseId]);
  const list = useMemo(() => {
    if (!st) return [];
    if (filter === "all") return st.photos;
    const now = filter === "confirm" && st.done ? [] : visible(st.photos, filter); // R3-B01: after 完成 nothing is left to confirm
    if (!frozen) return now;
    const byId = new Map(st.photos.map((p) => [p.id, p]));
    const kept = frozen.map((id) => byId.get(id)).filter((p): p is Photo => !!p);
    const have = new Set(frozen);
    return [...kept, ...now.filter((p) => !have.has(p.id))];
  }, [st, filter, frozen]);
  const listRef = useRef(list); listRef.current = list;

  // ───────────── card actions (stable, so cards do not redraw for nothing) ─────────────
  const commitEdit = useCallback((close: boolean) => {
    const e = editingRef.current;
    if (!e) return;
    if (idle.current) clearTimeout(idle.current);
    const cid = caseRef.current;
    const p = photoOf(e.id);
    if (close) setEditing(null);
    if (!p) return;
    const raw = e.text.trim();
    let target: string | null = null;
    if (raw) {
      const name = canonName(raw);
      if (!name) { say(tRef.current("nameTooLong")); return; }
      target = name === p.modelName ? null : name;
    }
    if (target === p.finalName) return;
    void rename(cid, e.id, target, e.session);
  }, [rename, say, setEditing]);

  const actions = useMemo<CardActions>(() => ({
    select: (id) => setCur(id),
    startEdit: (id) => {
      const p = photoOf(id);
      if (!p) return;
      setCur(id);
      setEditing({ id, text: shownName(p) ?? "", hint: null, session: uid(), orig: p.finalName });
    },
    editText: (text, picked) => {
      const e = editingRef.current;
      if (!e) return;
      setEditing({ ...e, text, hint: null, guard: undefined });
      if (idle.current) clearTimeout(idle.current);
      if (picked && inList(text.trim())) { commitEdit(true); return; } // chosen from the list: saved at once
      idle.current = setTimeout(() => commitEdit(false), 1000); // typing: saved a second after the last key
    },
    commitEdit: (close, confirmed) => {
      const e = editingRef.current;
      // pasted text nobody confirmed is dropped; Enter is the confirmation
      if (e?.guard !== undefined && e.text === e.guard && !(confirmed && e.text.trim())) { setEditing(null); return; }
      commitEdit(close);
    },
    cancelEdit: () => {
      const e = editingRef.current;
      if (idle.current) clearTimeout(idle.current);
      setEditing(null);
      // Escape = the name as it was when the box opened. What was typed may already be saved (a second after the last key): the old name is saved back.
      const p = e ? photoOf(e.id) : undefined;
      if (e && p && p.finalName !== e.orig) void rename(caseRef.current, e.id, e.orig, e.session);
    },
    copy: (id) => {
      const name = photoOf(id) ? shownName(photoOf(id)!) : null;
      if (!name) return;
      clip.current = name;
      void navigator.clipboard?.writeText(name).catch(() => {});
      setCur(id);
      say(tRef.current("copied", { name }));
    },
    paste: async (id) => {
      const cid = caseRef.current;
      let text = "";
      try { text = (await navigator.clipboard.readText()) ?? ""; } catch { /* blocked: fall back to what was copied on this page */ }
      if (!text.trim()) text = clip.current;
      const p = statesRef.current[cid]?.photos.find((x) => x.id === id);
      if (!p) return;
      setCur(id);
      const act = classifyPaste(text, p);
      const tt = tRef.current;
      if (act.kind === "noop") say(tt("pasteSame"));
      else if (act.kind === "restore") { void rename(cid, id, null); say(tt("restored")); }
      else if (act.kind === "save") void rename(cid, id, act.name);
      else if (act.kind === "confirm") setEditing({ id, text: act.text, hint: tt("pasteCheck"), session: uid(), guard: act.text, orig: p.finalName });
      else setEditing({ id, text: "", hint: tt("pasteHint"), session: uid(), guard: "", orig: p.finalName });
    },
    pick: (id, name) => { setCur(id); const p = photoOf(id); void rename(caseRef.current, id, p && name === p.modelName ? null : name); },
    restore: (id) => { setCur(id); void rename(caseRef.current, id, null); say(tRef.current("restored")); },
    openMove: (id) => { setCur(id); setMoveId(id); },
    dragStart: (id) => { dragId.current = id; },
    dragEnd: () => { dragId.current = null; },
    dropOn: (id) => {
      const from = dragId.current;
      dragId.current = null;
      const c = statesRef.current[caseRef.current];
      if (from == null || from === id || !c) return;
      moveTo(from, c.photos.findIndex((p) => p.id === id));
    },
  }), [commitEdit, rename, say, setEditing, moveTo]); // eslint-disable-line react-hooks/exhaustive-deps

  focusName.current = (id) => actions.startEdit(id);

  // ───────────── parts with no photo ─────────────
  const addExtra = useCallback((name: string) => {
    const cid = caseRef.current;
    return track(cid, (async () => {
      const r = await api("POST", `/api/cases/${cid}/photos/extras`, { name });
      if (!r.ok) { say(tRef.current(r.body.error === "name" ? "nameTooLong" : r.body.error === "limit" ? "partsFull" : failKey(r), { n: MAX_EXTRAS })); return; }
      const extra = r.body.extra as Extra;
      touch(cid);
      patchCase(cid, (c) => (c.extras.some((e) => e.id === extra.id) ? c : { ...c, extras: [...c.extras, extra] }));
      const added = tRef.current("partAdded", { name: extra.name });
      if (r.body.changed === false) say(added); // it was there already (added in another tab): nothing changed, so 完成 stays
      else cancelDone(cid, added);
    })());
  }, [patchCase, cancelDone, say, track, touch]);
  const removeExtra = useCallback((e: Extra) => {
    const cid = caseRef.current;
    patchCase(cid, (c) => ({ ...c, extras: c.extras.filter((x) => x.id !== e.id) }));
    return track(cid, (async () => {
      const r = await api("DELETE", `/api/cases/${cid}/photos/extras/${e.id}`);
      if (!r.ok) { say(tRef.current(failKey(r))); void load(cid, true); return; }
      touch(cid);
      patchCase(cid, (c) => ({ ...c, extras: c.extras.filter((x) => x.id !== e.id) })); // again: a load that came back meanwhile may have put it back
      const removed = tRef.current("partRemoved", { name: e.name });
      if (r.body.changed === false) say(removed); // already gone: nothing changed, so 完成 stays
      else cancelDone(cid, removed);
    })());
  }, [patchCase, cancelDone, say, load, track, touch]);

  // ───────────── add photos ─────────────
  const onFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    if (upRef.current) { say(tRef.current("upWait")); return; } // a second drop while photos go up: say so, do not lose it silently
    const cid = caseRef.current;
    const tt = tRef.current;
    upRef.current = true;
    setUp({ done: 0, total: files.length });
    let rep;
    try { rep = await uploadPhotos(cid, orgId, files, (done, total) => setUp({ done, total })); }
    catch { rep = { added: [], duplicates: [], failed: files.map((f) => ({ name: f.name, reason: "upload" })), unchecked: 0 }; }
    upRef.current = false;
    setUp(null);
    await load(cid, true);
    setCapped((c) => ({ ...c, [cid]: false }));
    setKick((k) => k + 1);
    const parts: string[] = [];
    if (rep.added.length) parts.push(tt("up.added", { n: rep.added.length }));
    if (rep.duplicates.length) parts.push(tt("up.dup", { n: rep.duplicates.length }));
    if (rep.failed.length) {
      const why = rep.failed[0].reason;
      // "status" = the case went past the point where photos can be added while the page was open
      parts.push(`${tt("up.failed", { n: rep.failed.length })}${["heic", "type", "size", "limit"].includes(why) ? `: ${tt(`up.${why}`)}` : why === "status" ? `: ${tt("block.status")}` : ""}`);
    }
    if (rep.unchecked) parts.push(tt("up.unchecked", { n: rep.unchecked }));
    say(parts.length ? parts.join(" · ") : tt("up.none"));
    if (rep.added.length) onDoneRef.current?.(); // inside a first-page line: the line's counts and step dots follow the new photos
  }, [up, orgId, load, say]);
  useEffect(() => {
    if (!up) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = tRef.current("leaveWarn"); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [up]);

  // ───────────── keyboard ─────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      // inside the first page the desk is one part of the page: its keys work while the focus is in it, or after a click in it
      // (a click on a photo selects it but leaves the focus on the page itself)
      if (embedded && !(el && root.current?.contains(el)) && !(el === document.body && active.current)) return;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (palette || moveId != null || help) return;
      const key = e.key;
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && key.toLowerCase() === "z") { e.preventDefault(); void undoLast(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const onControl = !!el && (el.tagName === "BUTTON" || el.tagName === "A") && el.matches(":focus-visible");
      const items = listRef.current;
      const step = (d: number) => {
        if (!items.length) return;
        const i = items.findIndex((p) => p.id === curRef.current);
        const next = items[i < 0 ? (d > 0 ? 0 : items.length - 1) : Math.min(items.length - 1, Math.max(0, i + d))];
        setCur(next.id);
        reveal(next.id);
      };
      const id = curRef.current;
      switch (key) {
        case "j": case "J": case "ArrowUp": e.preventDefault(); step(-1); break;
        case "k": case "K": case "ArrowDown": e.preventDefault(); step(1); break;
        case "1": case "2": case "3": {
          const p = id != null ? items.find((x) => x.id === id) : null;
          if (!p) break;
          const btn = frame.current?.querySelectorAll<HTMLButtonElement>(`[data-pid="${p.id}"] kbd`)[Number(key) - 1]?.parentElement;
          if (btn) { e.preventDefault(); (btn as HTMLButtonElement).click(); }
          break;
        }
        case "e": case "E": if (id != null) { e.preventDefault(); actions.startEdit(id); } break;
        case "c": case "C": if (id != null) { e.preventDefault(); actions.copy(id); } break;
        case "v": case "V": if (id != null) { e.preventDefault(); void actions.paste(id); } break;
        case "Enter": {
          if (onControl) break;
          e.preventDefault();
          const now = Date.now();
          if (!isEnterPair(lastEnter.current, now)) { lastEnter.current = now; break; } // the first Enter only starts the pair
          lastEnter.current = 0;
          if (statesRef.current[caseRef.current]?.done) { if (!embedded && !goNextOpen()) say(tRef.current("allDoneToast")); }
          else void pressDone().then((ok) => { if (ok && !embedded) goNextOpen(); });
          break;
        }
        case " ": case "Spacebar":
          if (onControl) break;
          e.preventDefault(); setPalette(true);
          break;
        case "?": e.preventDefault(); setHelp(true); break;
        case "<": case ",": case "ArrowLeft": e.preventDefault(); goCase(-1); break;
        case ">": case ".": case "ArrowRight": e.preventDefault(); goCase(1); break;
        case "Escape": disarm(); setHl(null); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [palette, moveId, help, undoLast, pressDone, goCase, goNextOpen, say, actions, disarm, embedded]);

  // ───────────── draw ─────────────
  const n = useMemo(() => (st ? counts(st.photos) : null), [st]);
  // what the header shows: once 完成 was pressed nothing is left to confirm (R3-B01)
  const nUi = n && st?.done ? { ...n, confirm: 0 } : n;
  useEffect(() => {
    const strip = tabStrip.current;
    const el = strip?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!strip || !el) return;
    const a = el.getBoundingClientRect(), b = strip.getBoundingClientRect();
    if (a.left < b.left) strip.scrollLeft -= b.left - a.left + 12;
    else if (a.right > b.right) strip.scrollLeft += a.right - b.right + 16;
  }, [caseId, n?.edited, tabs.length]); // R4-U03: also after the "changed" badge appears on the open tab
  const photoNames = useMemo(() => new Set((st?.photos ?? []).map(shownName).filter((x): x is string => !!x)), [st]);
  const indexOf = useMemo(() => new Map((st?.photos ?? []).map((p, i) => [p.id, i + 1])), [st]);
  const tabIndex = tabs.findIndex((x) => x.id === caseId);
  const blocked = !st || !n || !n.total ? tRef.current("block.empty") : n.naming ? t("block.naming", { n: n.naming }) : n.unnamed ? t("block.unnamed", { n: n.unnamed }) : null;
  const movePhoto = moveId != null ? st?.photos.find((p) => p.id === moveId) : null;
  const img = (id: number) => `/api/cases/${caseId}/photos/${id}/img?size=s`;

  // ───────────── the head of the desk ─────────────
  const noBar = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
  // the changed count of this case is live; the other cases show what the page was opened with
  const tabEdited = (x: DeskTab) => (x.id === caseId && n ? n.edited : x.edited);
  const stepBtn = "flex h-9 w-8 shrink-0 items-center justify-center rounded-[3px] text-mute transition-colors duration-150 hover:bg-panel2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent";
  const prev = <button type="button" className={stepBtn} aria-label={t("prevCase")} disabled={tabIndex <= 0} onClick={() => goCase(-1)}><Chevron className="rotate-90" /></button>;
  const next = <button type="button" className={stepBtn} aria-label={t("nextCase")} disabled={tabIndex < 0 || tabIndex >= tabs.length - 1} onClick={() => goCase(1)}><Chevron className="-rotate-90" /></button>;
  const doneCount = tabs.filter((x) => x.done).length;
  const doneBtn = (
    <button
      type="button" data-testid="done-btn" disabled={!st} onClick={() => void pressDone()} aria-pressed={!!st?.done}
      title={st?.done ? t("doneUndo") : blocked ?? t("doneHint")}
      className={`flex h-12 shrink-0 items-center justify-center gap-2 rounded-[4px] px-5 text-[16px] font-bold leading-none outline-offset-2 transition-[background-color,transform] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-scan active:translate-y-px max-sm:h-14 max-sm:w-full max-sm:text-[17px] ${
        st?.done ? "bg-go text-bay" : "bg-ice text-bay hover:bg-icehi"
      }`}
    >
      {st?.done && <Tick className="h-4 w-4" />}
      {st?.done ? t("doneOn") : t("doneBtn", { plate: st?.plate || tab?.plate || "" })}
      {!embedded && <span className={`text-[12px] font-medium tracking-normal ${st?.done ? "opacity-90" : "opacity-70"}`} data-testid="done-count">{t("doneCount", { d: doneCount, n: tabs.length })}</span>}
    </button>
  );
  const quiet = "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[3px] px-3 text-[13.5px] font-semibold text-fg transition-colors duration-150 hover:bg-panel2 disabled:opacity-40";
  const addBtn = (
    <>
      <input
        ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
        onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void onFiles(f); }}
      />
      <button type="button" disabled={!st || !!up} onClick={() => fileInput.current?.click()} className={quiet}>
        <Plus className="h-3.5 w-3.5" />{up ? t("uploading", { done: up.done, total: up.total }) : <span className="max-sm:sr-only">{t("addPhotos")}</span>}
      </button>
    </>
  );
  const soft = (f: Filter, label: string, count: number | null, hot: boolean) => (
    <button
      key={f} type="button" aria-pressed={filter === f} onClick={() => pickFilter(f)}
      className={`flex h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[3px] px-3 text-[13px] font-semibold transition-colors duration-150 sm:flex-none ${filter === f ? "bg-panel text-fg shadow-[0_1px_2px_rgba(10,14,19,0.14)]" : "text-mute hover:text-fg"}`}
    >
      {label}
      {count != null && <span className={`font-mono text-[12px] font-normal ${hot ? "text-amber" : "text-mute"}`}>{count}</span>}
    </button>
  );
  const filterSoft = (
    <div role="group" aria-label={t("filter")} className="flex min-w-0 rounded-[4px] bg-panel2 p-0.5 max-sm:flex-1" data-testid="desk-filter">
      {soft("all", t("f.all"), n?.total ?? null, false)}
      {soft("confirm", t("f.confirm"), nUi?.confirm ?? null, !!nUi?.confirm)}
      {soft("edited", t("f.edited"), n?.edited ?? null, false)}
    </div>
  );
  const title = (
    <div className="min-w-0">
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="font-mono text-[18px] font-semibold leading-none tracking-wide text-fg">{st?.plate || tab?.plate || ""}</h1>
        <p className="min-w-0 truncate text-[14px] text-mute" data-testid="vehicle-line">{[st?.carModel ?? tab?.carModel, tab?.workshop].filter(Boolean).join(" · ")}</p>
      </div>
    </div>
  );
  const extrasRow = (
    <div className={`flex items-center gap-1.5 overflow-x-auto lg:flex-wrap lg:overflow-visible ${noBar}`}>
      <span className="shrink-0 pr-1 text-[12.5px] text-mute">{t("extras")}</span>
      {st?.extras.map((e) => <ExtraChip key={e.id} e={e} onRemove={removeExtra} t={t} />)}
      <button
        type="button" disabled={!st} onClick={() => setPalette(true)}
        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[3px] px-2 text-[13px] font-semibold text-fg transition-colors duration-150 hover:bg-panel2 disabled:opacity-40"
      >
        <Plus className="h-3 w-3" />{t("addPart")}
        <kbd className="ml-1 hidden rounded-[2px] border border-hair px-1 font-mono text-[10.5px] font-normal text-mute lg:inline">Space</kbd>
      </button>
    </div>
  );
  const head = (
    // one raised card holds everything about this case: the cases, the case, its extra parts
    <div className="shrink-0 pb-2.5 pt-2.5 max-sm:pb-2 max-sm:pt-2">
      <div className="wrap max-sm:px-3">
        {st && !embedded && <div className="mb-2"><CaseSteps caseId={caseId} status={st.status} photos={st.photos.length} photosDone={st.done} here="photos" hint={false} /></div>}
        <div className="rounded-[6px] bg-panel shadow-[0_1px_2px_rgba(10,14,19,0.06),0_10px_28px_-14px_rgba(10,14,19,0.22)] ring-1 ring-hair">
          {!embedded && <div className="flex items-center gap-1.5 border-b border-hair px-2.5 py-1.5">
            {prev}
            <nav ref={tabStrip} aria-label={t("cases")} className={`flex min-w-0 flex-1 gap-1.5 overflow-x-auto p-0.5 ${noBar}`}>
              {tabs.map((x) => {
                const here = x.id === caseId;
                // on the black plate the small words are white at 70%, on a white one they are grey
                const sub = here ? "text-bay/70" : "text-mute";
                return (
                  <button
                    key={x.id} type="button" aria-current={here ? "true" : undefined} onClick={() => switchCase(x.id)}
                    className={`${TAB.base} ${here ? TAB.here : TAB.rest}`}
                  >
                    {x.plate}
                    {x.dup && <span className={`font-sans text-[12px] font-normal tracking-normal ${sub} ${here ? "max-sm:hidden" : ""}`} suppressHydrationWarning>{whenOf(x.at, lang)}</span>}
                    {tabEdited(x) > 0 && <span className={`${TAB.badge} ${here ? "bg-bay/20 text-bay" : "bg-panel2 text-fg"}`} data-testid="tab-edited">{t("tabEdited", { n: tabEdited(x) })}</span>}
                    {x.done
                      ? <Tick className={`h-4 w-4 ${here ? "text-bay" : "text-go"}`} />
                      : <span className={`font-sans text-[12.5px] font-normal tracking-normal ${sub}`}>{x.photos}</span>}
                  </button>
                );
              })}
            </nav>
            {next}
          </div>}
          {/* one row: the case, the filter with its three numbers, add photos, and 完成 at the right end (a phone gets 完成 as a bar along the bottom edge, R3-B03) */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-1.5 lg:px-5">
            {/* inside a line of the first page the line already shows the vehicle no. and the car */}
            {!embedded && <div className="min-w-0 sm:max-w-[320px]">{title}</div>}
            <div className="flex min-w-0 items-center gap-2 max-sm:w-full sm:ml-auto">
              {filterSoft}{addBtn}
            </div>
            <div className={embedded ? "max-sm:w-full" : "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-40 max-sm:border-t max-sm:border-hair max-sm:bg-panel max-sm:p-2.5 max-sm:pb-[calc(10px+env(safe-area-inset-bottom))] max-sm:shadow-[0_-8px_20px_-12px_rgba(10,14,19,0.35)]"} data-testid="done-wrap">{doneBtn}</div>
          </div>
          <div className="border-t border-hair px-4 py-1.5 max-sm:py-1 lg:px-5">{extrasRow}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      ref={root}
      // embedded: photos dropped on the desk are added to this case (the page's own drop, which starts a new case, is off meanwhile)
      onDragOver={embedded ? (e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } } : undefined}
      onDrop={embedded ? (e) => { const f = Array.from(e.dataTransfer.files); if (f.length) { e.preventDefault(); void onFiles(f); } } : undefined}
      className={embedded ? "flex h-[min(760px,85vh)] flex-col [&_.wrap]:!max-w-none [&_.wrap]:!px-3 sm:[&_.wrap]:!px-4" : "app-fill flex flex-col"} data-embedded={embedded || undefined}>
      {head}
      <div className="shrink-0">
        {signedOut && (
          <div className="wrap pb-2.5 max-sm:px-3 max-sm:pb-1" role="alert" data-testid="signed-out">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] font-medium text-fg">
              <span className="h-[9px] w-[9px] shrink-0 bg-amber" aria-hidden="true" />
              <span className="min-w-0">{t("signedOut")}</span>
              <a href={loginUrl(window.location.pathname, window.location.search)} className="link shrink-0 text-[13px] font-semibold">{t("logInAgain")}</a>
            </span>
          </div>
        )}
        {/* what is going on: only the naming progress. A failed call is tried again quietly; a photo left without a name asks for one on its own card */}
        {st && n && n.naming > 0 && (
          <div className="wrap pb-2.5 max-sm:px-3 max-sm:pb-1" role="status" data-testid="naming-line">
            <div className="flex items-center gap-3">
              <span className="shrink-0 font-mono text-[12.5px] text-ice">{t("naming", { n: n.naming })}</span>
              <span className="h-[2px] min-w-0 flex-1 overflow-hidden bg-hair" aria-hidden="true">
                <span className="block h-full bg-ice transition-[width] duration-500" style={{ width: `${Math.round(((n.total - n.naming) / Math.max(1, n.total)) * 100)}%` }} />
              </span>
              <span className="num shrink-0 font-mono text-[12.5px] text-mute">{n.total - n.naming}/{n.total}</span>
            </div>
          </div>
        )}
      </div>

      {/* the photos: this frame scrolls, the page does not */}
      <div ref={frame} className="app-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-hair" tabIndex={-1}>
        {loadFailed && !st ? (
          <div className="wrap flex flex-col items-center gap-4 py-16 text-center">
            <p className="text-[15px] text-fg">{t("loadFailed")}</p>
            <button type="button" className="btn-line !h-10" onClick={() => { setLoadFailed(false); void load(caseId, false); }}>{t("reload")}</button>
          </div>
        ) : !st ? (
          <div className="wrap grid grid-cols-2 gap-2 py-3 max-sm:px-3 sm:gap-4 sm:py-4" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="overflow-hidden rounded-[3px] border border-hair bg-panel">
                <div className="aspect-[4/3] bg-panel2 motion-safe:animate-pulse" />
                <div className="p-3"><div className="h-12 rounded-[3px] bg-panel2 motion-safe:animate-pulse" /></div>
              </div>
            ))}
          </div>
        ) : st.photos.length === 0 ? (
          <div className="wrap flex flex-col items-center px-4 py-14 text-center lg:py-20">
            <span className="text-ice"><UploadArt size={64} /></span>
            <h2 className="display-3 mt-5 text-[20px] text-fg">{t("empty.title")}</h2>
            <p className="mt-2 max-w-[44ch] text-[15px] leading-relaxed text-mute">{t("empty.body")}</p>
            <button type="button" disabled={!!up} onClick={() => fileInput.current?.click()} className="btn-primary mt-6">
              <Plus />{up ? t("uploading", { done: up.done, total: up.total }) : t("addPhotos")}
            </button>
          </div>
        ) : list.length === 0 ? (
          <div className="wrap flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-[15px] text-mute">{t("empty.filter")}</p>
            <button type="button" className="link text-[15px]" onClick={() => pickFilter("all")}>{t("empty.showAll")}</button>
          </div>
        ) : (
          // owner 2026-11-22: always two photos in a line, on every screen, so each photo is big enough to name from
          <div className={`wrap grid grid-cols-2 gap-2 pt-3 max-sm:px-3 sm:gap-4 sm:pt-4 ${embedded ? "pb-4" : "pb-24"}`} data-testid="photo-grid">
            {list.map((p, i) => (
              <PhotoCard
                key={p.id} p={p} n={indexOf.get(p.id) ?? 0} total={st.photos.length} src={img(p.id)} eager={i < 4}
                current={cur === p.id} editing={editing?.id === p.id ? editing : null}
                canDrag={filter === "all" && !editing} flash={flashId === p.id} hl={hl === p.id} a={actions} t={t}
              />
            ))}
            {/* the end of a long list: Done is here too, with what it does, so nobody has to scroll back up (owner 2026-11-27) */}
            <div className={`col-span-2 mt-2 flex flex-wrap items-center justify-between gap-4 rounded-[4px] border border-hair bg-panel px-4 py-4 ${embedded ? "" : "max-sm:mb-16"}`} data-testid="finish-card">
              <p className="min-w-0 flex-1 text-[14.5px] text-fg [text-wrap:pretty]">{n && n.naming > 0 && !st.done ? t("block.naming", { n: n.naming }) : st.done ? t(st.status === "phase_b" ? "finish.done" : st.status === "pending_doc" ? "finish.doneDocs" : st.status === "done" || st.status === "checking" ? "finish.doneOnly" : "finish.doneLater") : n && n.unnamed > 0 ? t("finish.unnamed", { n: n.unnamed }) : n && n.confirm > 0 ? t("finish.todo", { n: n.confirm }) : t("finish.ready")}</p>
              <button type="button" data-testid="done-btn-end" aria-pressed={st.done} title={st.done ? t("doneUndo") : undefined} onClick={() => void pressDone()} className={`flex h-12 items-center justify-center gap-2 rounded-[4px] px-5 text-[16px] font-bold leading-none max-sm:w-full ${st.done ? "bg-go text-bay" : "bg-ice text-bay hover:bg-icehi"}`}>
                {st.done && <Tick className="h-4 w-4" />}{st.done ? t("doneOn") : t("doneBtn", { plate: st.plate || "" })}
              </button>
              {st.done && !embedded && <a href={`/cases/${caseId}`} data-testid="finish-next" className="btn-primary max-sm:w-full">{t("finish.next")}</a>}
            </div>
          </div>
        )}
      </div>

      <datalist id="desk-part-names">{PART_NAMES.map((name) => <option key={name} value={name} />)}</datalist>

      {palette && st && <Palette extras={st.extras} photoNames={photoNames} onAdd={(name) => addExtra(name)} onRemove={removeExtra} onClose={() => setPalette(false)} t={t} />}
      {movePhoto && st && (
        <MoveSheet
          n={indexOf.get(movePhoto.id) ?? 1} total={st.photos.length} name={shownName(movePhoto)} src={img(movePhoto.id)}
          onMove={(to) => { const id = movePhoto.id; setMoveId(null); moveTo(id, to); }} onClose={() => setMoveId(null)} t={t}
        />
      )}
      {help && <HelpSheet onClose={() => setHelp(false)} t={t} />}

      <div aria-live="polite" className={`pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4 sm:bottom-[calc(16px+env(safe-area-inset-bottom))] ${embedded ? "bottom-[calc(16px+env(safe-area-inset-bottom))]" : "bottom-[calc(96px+env(safe-area-inset-bottom))]"}`}>
        {toast && (
          <div key={toast.key} className="flex max-w-[560px] items-center rounded-[3px] border border-hair bg-fg px-4 py-2.5 text-[14px] font-medium leading-snug text-bay shadow-[0_12px_24px_-12px_rgba(0,0,0,0.8)] motion-safe:animate-[deskrise_0.18s_ease-out]">
            <span>{toast.msg}</span>
            {toast.action && (
              <button type="button" data-testid="toast-action" onClick={toast.action.run} className="pointer-events-auto ml-4 rounded-[2px] border border-bay/40 px-2.5 py-1 text-[13px] font-bold uppercase tracking-wide hover:bg-bay/10">
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

