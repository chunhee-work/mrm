"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/components/lang-provider";
import { Chevron, Plus, Tick, UploadArt } from "@/components/app/marks";
import {
  classifyPaste, counts, isEnterPair, moved, nextUnnamed, shownName, visible, UndoStack,
  type CaseState, type Extra, type Filter, type Photo,
} from "@/lib/photos/desk-rules";
import { canonName, inList, PART_NAMES } from "@/lib/photos/rules";
import { fileTypeOf, openingMissing, photoPlan } from "@/lib/photos/order-rules";
import { photoT } from "@/lib/photos/strings";
import { PhotoCard, type CardActions, type Editing } from "./photo-card";
import { ExtraChip, HelpSheet, MoveSheet, Palette } from "./sheets";
import { uploadPhotos } from "./upload";

export type DeskTab = { id: string; plate: string; carModel: string | null; done: boolean; photos: number; when?: string };
type Reply = { ok: boolean; status: number; body: Record<string, unknown> };

async function api(method: string, url: string, body?: unknown): Promise<Reply> {
  try {
    const r = await fetch(url, {
      method, cache: "no-store",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: r.ok, status: r.status, body: j };
  } catch {
    return { ok: false, status: 0, body: {} };
  }
}
const uid = () => Math.random().toString(36).slice(2);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The photo naming desk. One page for every open case: tabs across the top, the photos of the current case in a
 * two-column grid that scrolls inside its own frame. Every change saves at once and is taken back if the save fails.
 */
export default function NamingDesk({ orgId, tabs: firstTabs, initialId }: { orgId: string; tabs: DeskTab[]; initialId: string }) {
  const { lang } = useT();
  const t = useMemo(() => photoT(lang), [lang]);
  const tRef = useRef(t); tRef.current = t;

  const [tabs, setTabs] = useState(firstTabs);
  const [caseId, setCaseId] = useState(initialId);
  const caseRef = useRef(caseId); caseRef.current = caseId;
  const [states, setStatesRaw] = useState<Record<string, CaseState>>({});
  const statesRef = useRef(states);
  const mutate = useCallback((fn: (s: Record<string, CaseState>) => Record<string, CaseState>) => {
    const next = fn(statesRef.current);
    statesRef.current = next;
    setStatesRaw(next);
  }, []);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const filterRef = useRef<Filter>("all");
  const [frozen, setFrozen] = useState<number[] | null>(null);
  const [cur, setCur] = useState<number | null>(null);
  const curRef = useRef(cur); curRef.current = cur;
  const [editing, setEditingRaw] = useState<(Editing & { guard?: string }) | null>(null);
  const editingRef = useRef(editing);
  const setEditing = useCallback((e: (Editing & { guard?: string }) | null) => { editingRef.current = e; setEditingRaw(e); }, []);
  const [toast, setToast] = useState<{ msg: string; key: number } | null>(null);
  const [hl, setHl] = useState<number | null>(null); // the unnamed photo the last 完成 click jumped to
  const hlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastJump = useRef<number | null>(null);
  const lastEnter = useRef(0); // Enter, Enter within 700 ms = 完成 and on to the next case
  const focusName = useRef<(id: number) => void>(() => {});
  const [palette, setPalette] = useState(false);
  const [moveId, setMoveId] = useState<number | null>(null);
  const [help, setHelp] = useState(false);
  const [up, setUp] = useState<{ done: number; total: number } | null>(null);
  const [capped, setCapped] = useState<Record<string, boolean>>({});
  const [flashId, setFlashId] = useState<number | null>(null);
  const [shown, setShown] = useState(true); // browser tab visible
  const [kick, setKick] = useState(0);

  const server = useRef(new Map<number, Photo>()); // last row the server confirmed, per photo
  const writes = useRef(new Map<number, { busy: boolean; next?: { target: string | null; session?: string } }>());
  const order = useRef(new Map<string, { busy: boolean; next: boolean }>()); // one saving queue per case
  const undo = useRef(new UndoStack());
  const clip = useRef("");
  const dragId = useRef<number | null>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const tabStrip = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const st = states[caseId];
  const tab = tabs.find((x) => x.id === caseId);
  const tabsRef = useRef(tabs); tabsRef.current = tabs;

  const say = useCallback((msg: string) => setToast({ msg, key: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), Math.min(7000, 2600 + toast.msg.length * 40));
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
  const disarm = useCallback(() => { lastEnter.current = 0; }, []);

  // ───────────── load / refresh ─────────────
  const load = useCallback(async (cid: string, quiet: boolean) => {
    const r = await api("GET", `/api/cases/${cid}/photos`);
    if (!r.ok) { if (!quiet && caseRef.current === cid) setLoadFailed(true); return; }
    const fresh = r.body as unknown as CaseState;
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
  }, [mutate]);

  useEffect(() => { void load(caseId, false); }, [caseId, load]);
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
  const hasWaiting = !!st && st.photos.some((p) => p.state === "pending" || p.state === "running");
  useEffect(() => {
    if (!hasWaiting || !shown || capped[caseId]) return;
    let stop = false;
    const cid = caseId;
    (async () => {
      let errors = 0;
      while (!stop) {
        const r = await api("POST", `/api/cases/${cid}/photos/name`, {});
        if (stop) return;
        await load(cid, true);
        if (stop) return;
        if (!r.ok) { if (++errors >= 3) return; await sleep(4000); continue; }
        errors = 0;
        if (r.body.capped) { setCapped((c) => ({ ...c, [cid]: true })); return; }
        if (!r.body.remaining) return;
        if (!r.body.claimed) await sleep(4000); // another tab is naming them
      }
    })();
    return () => { stop = true; };
  }, [hasWaiting, shown, caseId, capped, load, kick]);

  // ───────────── names ─────────────
  const rename = useCallback(async (cid: string, id: number, target: string | null, session?: string) => {
    const c = statesRef.current[cid];
    const p = c?.photos.find((x) => x.id === id);
    if (!c || !p) return;
    const w = writes.current.get(id) ?? { busy: false };
    writes.current.set(id, w);
    if (p.finalName === target && !w.busy) return;
    patchPhoto(cid, id, (x) => ({ ...x, finalName: target }));
    if (c.done) setDoneLocal(cid, false);
    if (w.busy) { w.next = { target, session }; return; } // latest wins; it goes out when the save in flight returns
    w.busy = true;
    let job: { target: string | null; session?: string } = { target, session };
    for (;;) {
      const base = server.current.get(id) ?? p;
      const r = await api("PATCH", `/api/cases/${cid}/photos/${id}`, { finalName: job.target, version: base.version });
      if (r.ok) {
        const row = r.body.photo as Photo;
        if (row.finalName !== base.finalName) undo.current.push({ caseId: cid, photoId: id, prev: base.finalName, after: row.version, session: job.session });
        server.current.set(id, row);
        if (w.next) { job = w.next; w.next = undefined; continue; }
        patchPhoto(cid, id, () => row);
        break;
      }
      w.next = undefined;
      if (r.status === 409 && r.body.photo) {
        const row = r.body.photo as Photo;
        server.current.set(id, row);
        patchPhoto(cid, id, () => row);
        undo.current.dropPhoto(cid, id);
        say(tRef.current("changedElsewhere"));
      } else {
        patchPhoto(cid, id, () => base);
        say(tRef.current(r.body.error === "name" ? "nameTooLong" : "saveFailed"));
        w.busy = false;
        void load(cid, true);
      }
      break;
    }
    w.busy = false;
  }, [patchPhoto, setDoneLocal, say, load]);

  const undoLast = useCallback(async () => {
    const e = undo.current.peek();
    if (!e) { say(tRef.current("undoNone")); return; }
    const w = writes.current.get(e.photoId) ?? { busy: false };
    writes.current.set(e.photoId, w);
    if (w.busy) return;
    const base = server.current.get(e.photoId);
    if (!base) { undo.current.dropPhoto(e.caseId, e.photoId); say(tRef.current("undoNone")); return; }
    w.busy = true;
    const r = await api("PATCH", `/api/cases/${e.caseId}/photos/${e.photoId}`, { finalName: e.prev, version: base.version });
    w.busy = false;
    const queued = w.next; // a name picked while the undo was on its way: it goes out next, on top of the undo
    w.next = undefined;
    if (r.ok) {
      const row = r.body.photo as Photo;
      undo.current.done(e, row.version);
      server.current.set(row.id, row);
      patchPhoto(e.caseId, row.id, () => row);
      setDoneLocal(e.caseId, false);
      if (caseRef.current === e.caseId) { setCur(row.id); reveal(row.id); }
      say(`${tRef.current("undoDone")}: ${shownName(row) ?? tRef.current("nameNeeded")}`);
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
  }, [patchPhoto, setDoneLocal, say, rename]); // eslint-disable-line react-hooks/exhaustive-deps

  const photoOf = (id: number) => statesRef.current[caseRef.current]?.photos.find((x) => x.id === id);

  // ───────────── order ─────────────
  const applyOrder = useCallback((cid: string, next: Photo[]) => {
    patchCase(cid, (c) => ({ ...c, photos: next }));
    setDoneLocal(cid, false);
    let q = order.current.get(cid);
    if (!q) { q = { busy: false, next: false }; order.current.set(cid, q); }
    const o = q;
    if (o.busy) { o.next = true; return; }
    o.busy = true;
    void (async () => {
      for (;;) {
        o.next = false;
        const c = statesRef.current[cid];
        if (!c) break;
        const r = await api("PUT", `/api/cases/${cid}/photos/order`, { ids: c.photos.map((p) => p.id), rev: c.rev });
        if (r.ok) {
          patchCase(cid, (x) => ({ ...x, rev: Number(r.body.rev) }));
          if (o.next) continue;
          break;
        }
        o.busy = false;
        say(tRef.current(r.status === 409 ? "orderElsewhere" : "saveFailed"));
        await load(cid, true);
        return;
      }
      o.busy = false;
    })();
  }, [patchCase, setDoneLocal, say, load]);

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
      const el = f?.querySelector<HTMLElement>(`[data-pid="${target.id}"]`);
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

  const pressDone = useCallback(async (): Promise<boolean> => {
    const cid = caseRef.current;
    const c = statesRef.current[cid];
    const tt = tRef.current;
    if (!c) return false;
    if (c.done) {
      setDoneLocal(cid, false);
      const r = await api("PUT", `/api/cases/${cid}/photos/done`, { done: false });
      if (r.ok) say(tt("undone")); else void load(cid, true);
      return false;
    }
    const n = counts(c.photos);
    if (!n.total) { say(tt("block.empty")); return false; }
    if (n.naming) { say(tt("block.naming", { n: n.naming })); return false; }
    if (n.unnamed) { jumpUnnamed(); return false; }
    lastJump.current = null;
    setHl(null);
    const r = await api("PUT", `/api/cases/${cid}/photos/done`, { done: true });
    if (r.ok) {
      setDoneLocal(cid, true);
      const left = tabsRef.current.filter((x) => x.id !== cid && !x.done).length;
      say(left ? tt("doneToast", { plate: c.plate }) : tt("allDoneToast"));
      return true;
    }
    const reason = r.body.reason as string | undefined;
    say(r.body.error === "status" ? tt("block.status") : reason ? tt(`block.${reason}`, { n: Number(r.body.count ?? 0) }) : tt("saveFailed"));
    void load(cid, true);
    return false;
  }, [setDoneLocal, say, load, jumpUnnamed]); // eslint-disable-line react-hooks/exhaustive-deps

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
    window.history.replaceState(null, "", `/cases/${id}/photos`);
    if (frame.current) frame.current.scrollTop = 0;
  }, [disarm, setEditing]);
  const goCase = useCallback((dir: number) => {
    const i = tabs.findIndex((x) => x.id === caseRef.current);
    const next = tabs[i + dir];
    if (next) switchCase(next.id);
  }, [tabs, switchCase]);
  useEffect(() => {
    const strip = tabStrip.current;
    const el = strip?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!strip || !el) return;
    const a = el.getBoundingClientRect(), b = strip.getBoundingClientRect();
    if (a.left < b.left) strip.scrollLeft -= b.left - a.left + 12;
    else if (a.right > b.right) strip.scrollLeft += a.right - b.right + 12;
  }, [caseId]);

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
    const now = visible(st.photos, filter);
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
      setEditing({ id, text: shownName(p) ?? "", hint: null, session: uid() });
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
    cancelEdit: () => { if (idle.current) clearTimeout(idle.current); setEditing(null); },
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
      else if (act.kind === "confirm") setEditing({ id, text: act.text, hint: tt("pasteCheck"), session: uid(), guard: act.text });
      else setEditing({ id, text: "", hint: tt("pasteHint"), session: uid(), guard: "" });
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
  const addExtra = useCallback(async (name: string) => {
    const cid = caseRef.current;
    const r = await api("POST", `/api/cases/${cid}/photos/extras`, { name });
    if (!r.ok) { say(tRef.current(r.body.error === "name" ? "nameTooLong" : "saveFailed")); return; }
    const extra = r.body.extra as Extra;
    patchCase(cid, (c) => (c.extras.some((e) => e.id === extra.id) ? c : { ...c, extras: [...c.extras, extra] }));
    setDoneLocal(cid, false);
    say(tRef.current("partAdded", { name: extra.name }));
  }, [patchCase, setDoneLocal, say]);
  const removeExtra = useCallback(async (e: Extra) => {
    const cid = caseRef.current;
    patchCase(cid, (c) => ({ ...c, extras: c.extras.filter((x) => x.id !== e.id) }));
    setDoneLocal(cid, false);
    const r = await api("DELETE", `/api/cases/${cid}/photos/extras/${e.id}`);
    if (r.ok) say(tRef.current("partRemoved", { name: e.name }));
    else { say(tRef.current("saveFailed")); void load(cid, true); }
  }, [patchCase, setDoneLocal, say, load]);

  // ───────────── add photos ─────────────
  const onFiles = useCallback(async (files: File[]) => {
    if (!files.length || up) return;
    const cid = caseRef.current;
    const tt = tRef.current;
    setUp({ done: 0, total: files.length });
    let rep;
    try { rep = await uploadPhotos(cid, orgId, files, (done, total) => setUp({ done, total })); }
    catch { rep = { added: [], duplicates: [], failed: files.map((f) => ({ name: f.name, reason: "upload" })), unchecked: 0 }; }
    setUp(null);
    await load(cid, true);
    setCapped((c) => ({ ...c, [cid]: false }));
    setKick((k) => k + 1);
    const parts: string[] = [];
    if (rep.added.length) parts.push(tt("up.added", { n: rep.added.length }));
    if (rep.duplicates.length) parts.push(tt("up.dup", { n: rep.duplicates.length }));
    if (rep.failed.length) {
      const why = rep.failed[0].reason;
      parts.push(`${tt("up.failed", { n: rep.failed.length })}${["heic", "type", "size", "limit"].includes(why) ? `: ${tt(`up.${why}`)}` : ""}`);
    }
    if (rep.unchecked) parts.push(tt("up.unchecked", { n: rep.unchecked }));
    say(parts.length ? parts.join(" · ") : tt("up.none"));
  }, [up, orgId, load, say]);
  useEffect(() => {
    if (!up) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = tRef.current("leaveWarn"); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [up]);

  const retryNaming = useCallback(async () => {
    const cid = caseRef.current;
    setCapped((c) => ({ ...c, [cid]: false }));
    patchCase(cid, (c) => ({ ...c, photos: c.photos.map((p) => (p.state === "failed" ? { ...p, state: "pending", error: null } : p)) }));
    await api("POST", `/api/cases/${cid}/photos/name`, { retryFailed: true });
    await load(cid, true);
    setKick((k) => k + 1);
  }, [patchCase, load]);

  // ───────────── keyboard ─────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
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
          if (statesRef.current[caseRef.current]?.done) goCase(1);
          else void pressDone().then((ok) => { if (ok) goCase(1); });
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
  }, [palette, moveId, help, undoLast, pressDone, goCase, actions, disarm]);

  // ───────────── draw ─────────────
  const n = useMemo(() => (st ? counts(st.photos) : null), [st]);
  const photoNames = useMemo(() => new Set((st?.photos ?? []).map(shownName).filter((x): x is string => !!x)), [st]);
  const indexOf = useMemo(() => new Map((st?.photos ?? []).map((p, i) => [p.id, i + 1])), [st]);
  const tabIndex = tabs.findIndex((x) => x.id === caseId);
  const missingOpen = useMemo(() => (st && st.photos.length ? openingMissing(st.photos.map(shownName)) : []), [st]);
  const plan = useMemo(() => (st ? photoPlan(st.photos.map((p) => ({ id: p.id, srcName: p.srcName, name: shownName(p) }))) : null), [st]);
  const blocked = !st || !n || !n.total ? tRef.current("block.empty") : n.naming ? t("block.naming", { n: n.naming }) : n.unnamed ? t("block.unnamed", { n: n.unnamed }) : null;
  const movePhoto = moveId != null ? st?.photos.find((p) => p.id === moveId) : null;
  const img = (id: number) => `/api/cases/${caseId}/photos/${id}/img?size=s`;

  // ───────────── the head of the desk ─────────────
  const noBar = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
  const tabMark = (x: DeskTab) => x.done
    ? <Tick className="h-3.5 w-3.5 text-go" />
    : <span className="text-[12px] font-normal text-mute">{x.photos}</span>;
  const stepBtn = "flex h-9 w-8 shrink-0 items-center justify-center rounded-[3px] text-mute transition-colors duration-150 hover:bg-panel2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent";
  const prev = <button type="button" className={stepBtn} aria-label={t("prevCase")} disabled={tabIndex <= 0} onClick={() => goCase(-1)}><Chevron className="rotate-90" /></button>;
  const next = <button type="button" className={stepBtn} aria-label={t("nextCase")} disabled={tabIndex < 0 || tabIndex >= tabs.length - 1} onClick={() => goCase(1)}><Chevron className="-rotate-90" /></button>;
  const doneCount = tabs.filter((x) => x.done).length;
  const doneBtn = (
    <button
      type="button" data-testid="done-btn" onClick={() => void pressDone()} aria-pressed={!!st?.done}
      title={st?.done ? undefined : blocked ?? t("doneHint")}
      className={`flex h-12 min-w-[12rem] shrink-0 items-center justify-center gap-2.5 rounded-[4px] px-7 text-[17px] font-bold leading-none tracking-wide shadow-[0_6px_16px_-8px_rgba(10,14,19,0.55)] outline-offset-2 transition-[background-color,transform] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-scan active:translate-y-px max-sm:h-14 max-sm:w-full max-sm:text-[18px] ${
        st?.done ? "bg-go text-bay" : "bg-ice text-bay hover:bg-icehi"
      }`}
    >
      {st?.done && <Tick className="h-5 w-5" />}
      {st?.done ? t("doneOn") : t("doneBtn", { plate: st?.plate || tab?.plate || "", d: doneCount, n: tabs.length })}
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
        <Plus className="h-3.5 w-3.5" />{up ? t("uploading", { done: up.done, total: up.total }) : t("addPhotos")}
      </button>
    </>
  );
  const helpBtn = <button type="button" onClick={() => setHelp(true)} aria-label={t("help")} title={t("help")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] font-mono text-[14px] text-mute transition-colors duration-150 hover:bg-panel2 hover:text-fg">?</button>;
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
    <div role="group" aria-label={t("filter")} className="flex min-w-0 rounded-[4px] bg-panel2 p-0.5 max-sm:basis-full">
      {soft("all", t("f.all"), n?.total ?? null, false)}
      {soft("confirm", t("f.confirm"), n?.confirm ?? null, !!n?.confirm)}
      {soft("edited", t("f.edited"), n?.edited ?? null, false)}
    </div>
  );
  const title = (
    <div className="min-w-0">
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="font-mono text-[20px] font-semibold leading-none tracking-wide text-fg lg:text-[22px]">{st?.plate || tab?.plate || ""}</h1>
        <p className="min-w-0 truncate text-[14px] text-mute">{st?.carModel ?? tab?.carModel ?? ""}</p>
      </div>
      {plan && plan.photos > 0 && (
        <p className="mt-1.5 max-w-[68ch] font-mono text-[11.5px] leading-snug text-mute" data-testid="photo-plan">
          {t("planLine", { n: plan.photos, types: Object.entries(plan.types).map(([k, v]) => `${k} ×${v}`).join(" · ") })}
        </p>
      )}
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
    <div className="shrink-0 pb-3 pt-3 lg:pt-4">
      <div className="wrap max-sm:px-3">
        <div className="rounded-[6px] bg-panel shadow-[0_1px_2px_rgba(10,14,19,0.06),0_10px_28px_-14px_rgba(10,14,19,0.22)] ring-1 ring-hair">
          <div className="flex items-center gap-1.5 border-b border-hair px-2.5 py-2">
            {prev}
            <nav ref={tabStrip} aria-label={t("cases")} className={`flex min-w-0 flex-1 gap-1.5 overflow-x-auto p-0.5 ${noBar}`}>
              {tabs.map((x) => {
                const here = x.id === caseId;
                return (
                  <button
                    key={x.id} type="button" aria-current={here ? "true" : undefined} onClick={() => switchCase(x.id)}
                    className={`flex h-8 shrink-0 items-center gap-2 rounded-full px-3.5 font-mono text-[13px] tracking-wide transition-colors duration-150 ${here ? "bg-icetint font-semibold text-fg ring-[1.5px] ring-inset ring-scan" : "bg-panel2 text-fg hover:bg-hair"}`}
                  >
                    {x.plate}{x.when && <span className="text-[11.5px] font-normal text-mute">{x.when}</span>}{tabMark(x)}
                  </button>
                );
              })}
            </nav>
            {next}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3.5 lg:px-5">
            {title}
            <div className="flex min-w-0 flex-wrap items-center gap-2 max-sm:basis-full">
              {filterSoft}{addBtn}<span className="flex-1 sm:hidden" />{helpBtn}
            </div>
          </div>
          <div className="border-t border-hair px-4 py-2 lg:px-5">{extrasRow}</div>
          <div className="flex border-t border-hair p-3 lg:justify-end lg:px-5">{doneBtn}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app-fill flex flex-col">
      {head}
      <div className="shrink-0">
        {/* what is going on: naming progress, or what needs a second try */}
        {st && n && !n.naming && n.total > 0 && missingOpen.length > 0 && (
          <div className="wrap pb-2.5 max-sm:px-3" role="status">
            <span className="flex items-center gap-2 text-[13.5px] font-medium text-fg">
              <span className="h-[9px] w-[9px] shrink-0 bg-amber" aria-hidden="true" />
              {t("openingMissing", { list: missingOpen.join(", ") })}
            </span>
          </div>
        )}
        {st && n && (n.naming > 0 || n.failed > 0 || capped[caseId]) && (
          <div className="wrap pb-2.5 max-sm:px-3" role="status">
            {n.naming > 0 ? (
              <div className="flex items-center gap-3">
                <span className="shrink-0 font-mono text-[12.5px] text-ice">{t("naming", { n: n.naming })}</span>
                <span className="h-[2px] min-w-0 flex-1 overflow-hidden bg-hair" aria-hidden="true">
                  <span className="block h-full bg-ice transition-[width] duration-500" style={{ width: `${Math.round(((n.total - n.naming) / Math.max(1, n.total)) * 100)}%` }} />
                </span>
                <span className="num shrink-0 font-mono text-[12.5px] text-mute">{n.total - n.naming}/{n.total}</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="flex items-center gap-2 text-[13.5px] font-medium text-fg">
                  <span className="h-[9px] w-[9px] shrink-0 bg-amber" aria-hidden="true" />
                  {capped[caseId] ? t("capLine") : t("failedLine", { n: n.failed })}
                </span>
                {!capped[caseId] && n.failed > 0 && (
                  <button type="button" onClick={() => void retryNaming()} className="link min-h-[32px] text-[13.5px]">{t("retry")}</button>
                )}
              </div>
            )}
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
          <div className="wrap grid grid-cols-2 gap-2 pb-24 pt-3 max-sm:px-3 sm:gap-4 sm:pt-4">
            {list.map((p) => (
              <PhotoCard
                key={p.id} p={p} n={indexOf.get(p.id) ?? 0} total={st.photos.length} src={img(p.id)}
                current={cur === p.id} editing={editing?.id === p.id ? editing : null}
                canDrag={filter === "all" && !editing} flash={flashId === p.id} hl={hl === p.id} a={actions} t={t}
              />
            ))}
          </div>
        )}
      </div>

      <datalist id="desk-part-names">{PART_NAMES.map((name) => <option key={name} value={name} />)}</datalist>

      {palette && st && <Palette extras={st.extras} photoNames={photoNames} onAdd={(name) => void addExtra(name)} onRemove={removeExtra} onClose={() => setPalette(false)} t={t} />}
      {movePhoto && st && (
        <MoveSheet
          n={indexOf.get(movePhoto.id) ?? 1} total={st.photos.length} name={shownName(movePhoto)} src={img(movePhoto.id)}
          onMove={(to) => { const id = movePhoto.id; setMoveId(null); moveTo(id, to); }} onClose={() => setMoveId(null)} t={t}
        />
      )}
      {help && <HelpSheet onClose={() => setHelp(false)} t={t} />}

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(16px+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4">
        {toast && (
          <div key={toast.key} className="max-w-[560px] rounded-[3px] border border-hair bg-fg px-4 py-2.5 text-[14px] font-medium leading-snug text-bay shadow-[0_12px_24px_-12px_rgba(0,0,0,0.8)] motion-safe:animate-[deskrise_0.18s_ease-out]">
            {toast.msg}
          </div>
        )}
      </div>
    </div>
  );
}

