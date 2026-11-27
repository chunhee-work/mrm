"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/lang-provider";
import { whenOf } from "@/lib/fmt-when";

export type Cred = {
  saved: boolean; usernameHint: string | null; verifyState: string; blocked: boolean; updatedAt?: string | null;
  workshop: string | null; workshops: { slot: number; name: string }[]; manager: string | null; adjuster: string | null; complete: boolean; storageOk: boolean; keyOk: boolean; blocks: boolean;
};

export const CHECKING = ["queued", "checking", "otp_submitted"];

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }} aria-label={title}
      className="m-auto w-[min(520px,calc(100vw-32px))] max-w-none rounded-[6px] border border-hair bg-white p-0 text-fg shadow-xl backdrop:bg-black/40 max-sm:mb-0 max-sm:w-full max-sm:rounded-b-none">
      <div className="max-h-[calc(100dvh-48px)] overflow-y-auto p-5">
        <h3 className="mb-4 text-[20px] font-semibold leading-tight text-fg">{title}</h3>
        {open && children}
      </div>
    </dialog>
  );
}

/**
 * The details an account types once (owner 2026-11-27): Merimen login, workshop, manager, adjuster. Our worker remembers them.
 * Not complete: the whole form on the front page. Complete: a small summary with Edit. An edit asks "replace?" in a pop-up
 * before anything is sent. The password is never shown again; leaving it empty on an edit keeps the saved login.
 */
/**
 * `look` (complete profile only): "side" = the summary card, shown on the first page only when the login needs the user (wrong
 * password, a code from the phone, still being checked); "page" = the form itself on its own page, filled in
 * with what is saved (owner 2026-11-27: one link in the side bar leads there, the details are typed and changed right on it). A login that needs the user (wrong password, a code from the phone) always shows the full card.
 */
export default function ProfileCard({ cred, setCred, onSaved, compact, look = "side" }: { cred: Cred; setCred: (c: Cred) => void; onSaved?: () => void; compact: boolean; look?: "side" | "page" }) {
  const configured = cred.keyOk;
  const { t, lang } = useT();
  const [names, setNames] = useState<string[]>(["", "", ""]); // workshop 1..3; "" = not used
  const [opened, setOpened] = useState<boolean[]>([true, false, false]); // rows the user opened with "add"
  const [manager, setManager] = useState("");
  const [adjuster, setAdjuster] = useState("");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sure, setSure] = useState(false);
  const [code, setCode] = useState("");
  const [showPass, setShowPass] = useState(false); // the eye on the password box

  // poll while the worker checks the login
  useEffect(() => {
    if (!CHECKING.includes(cred.verifyState)) return;
    let ticks = 0;
    const id = setInterval(async () => {
      if (++ticks > 90) { clearInterval(id); return; } // 3 minutes, then stop asking (the worker may be offline)
      try { const r = await fetch("/api/ext/worker/credentials"); if (r.ok) setCred(await r.json()); } catch { /* next tick */ }
    }, 2000);
    return () => clearInterval(id);
  }, [cred.verifyState, setCred]);

  // `c`: what to put in the boxes, the saved answer right after a save (the `cred` prop is still the old one then)
  function fill(c: Cred = cred) { const n = ["", "", ""]; for (const w of c.workshops ?? []) if (w.slot >= 1 && w.slot <= 3) n[w.slot - 1] = w.name; if (!n[0] && c.workshop) n[0] = c.workshop; setNames(n); setOpened([true, false, false]); setManager(c.manager ?? ""); setAdjuster(c.adjuster ?? ""); setUser(""); setPass(""); setOk(false); setErr(null); setSure(false); }
  // the full form opens with what is saved (the workshop list outlives a deleted login), so a save never drops workshops the user cannot see
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!compact) fill(); }, []);
  function openEdit() { fill(); setEditing(true); }
  // its own page: the saved details are in the boxes from the start (once: a refresh must not wipe what is being typed)
  useEffect(() => { if (compact && look === "page") fill(); }, [look]); // eslint-disable-line react-hooks/exhaustive-deps
  function closeAll() { setShowPass(false); setEditing(false); setConfirming(false); setPass(""); setSure(false); }

  const lower = names.map((n) => n.trim().toLowerCase()).filter(Boolean);
  const wsDup = new Set(lower).size !== lower.length; // two workshops with the same name
  const first = !cred.saved;
  const loginTyped = !!(user || pass);
  const canSend = configured && cred.storageOk && !busy && ok && !!names[0].trim() && !wsDup && !!manager.trim() && !!adjuster.trim()
    && (first ? !!user && !!pass : (!loginTyped || (!!user && !!pass)));

  // first time: send at once. An edit: ask in a pop-up first.
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    if (first || !cred.complete) void send(); else setConfirming(true); // only a real edit of complete details asks "replace?"
  }
  async function send() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/ext/worker/credentials", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workshops: names.map((name, i) => ({ slot: i + 1, name })).filter((w, i) => i === 0 || w.name.trim()), manager, adjuster, ...(loginTyped ? { username: user, password: pass } : {}), consent: true }) });
      if (r.status === 409) { setErr(t("pf.wsInUse")); setConfirming(false); }
      else if (r.status === 503) { setErr(t("ml.notReady")); setConfirming(false); }
      else if (r.status === 429) { setErr(t("pf.tooMany")); setConfirming(false); }
      else if (!r.ok) { setErr(t("w.err")); setConfirming(false); }
      else { const next: Cred = await r.json(); setCred(next); closeAll(); fill(next); onSaved?.(); }
    } catch { setErr(t("w.err")); setConfirming(false); } finally { setPass(""); setShowPass(false); setBusy(false); }
  }
  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !code) return;
    setBusy(true);
    try {
      const r = await fetch("/api/ext/worker/otp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
      if (r.ok) { setCode(""); setCred({ ...cred, verifyState: "otp_submitted" }); }
    } finally { setBusy(false); }
  }
  async function remove() {
    if (busy) return;
    if (!sure) { setSure(true); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/ext/worker/credentials", { method: "DELETE" });
      if (r.ok) { const next: Cred = { ...cred, saved: false, usernameHint: null, verifyState: "none", blocked: false, updatedAt: null, manager: null, adjuster: null, complete: false, blocks: cred.keyOk && cred.storageOk }; setCred(next); closeAll(); fill(next); onSaved?.(); }
    } finally { setBusy(false); setSure(false); }
  }

  const Fields = (editMode: boolean) => (
    <div className="grid gap-4" data-testid="pf-fields">
      <div className="grid gap-3" data-testid="pf-workshops">
        <span className="label">{t("pf.workshops")}</span>
        {[0, 1, 2].filter((i) => i === 0 || opened[i] || names[i]).map((i) => (
          <div key={i} className="flex items-center gap-2">
            <label className="field min-w-0 flex-1"><span className="note text-mute">{t("pf.wsN", { n: String(i + 1) })}</span>
              <input value={names[i]} onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))} maxLength={120} autoComplete="organization" className="input" data-testid={i === 0 ? "pf-workshop" : `pf-workshop-${i + 1}`} disabled={!configured} /></label>
            {i > 0 && <button type="button" onClick={() => { setNames(names.map((x, j) => (j === i ? "" : x))); setOpened(opened.map((x, j) => (j === i ? false : x))); }} className="btn-quiet !h-11 self-end !text-mute" data-testid={`pf-workshop-rm-${i + 1}`} disabled={!configured}>{t("pf.wsRemove")}</button>}
          </div>
        ))}
        {[1, 2].some((i) => !opened[i] && !names[i]) && (
          <div><button type="button" onClick={() => { const i = [1, 2].find((k) => !opened[k] && !names[k])!; setOpened(opened.map((x, j) => (j === i ? true : x))); }} className="btn-line !h-10 !px-4 !text-[14px]" data-testid="pf-workshop-add" disabled={!configured}>+ {t("pf.wsAdd")}</button></div>
        )}
        {wsDup && <p role="alert" className="field-error" data-testid="pf-ws-dup">{t("pf.wsDup")}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field"><span className="label">{t("pf.manager")}</span>
          <input value={manager} onChange={(e) => setManager(e.target.value)} maxLength={120} autoComplete="off" className="input" data-testid="pf-manager" disabled={!configured} /></label>
        <label className="field"><span className="label">{t("pf.adjuster")}</span>
          <input value={adjuster} onChange={(e) => setAdjuster(e.target.value)} maxLength={120} autoComplete="off" className="input" data-testid="pf-adjuster" disabled={!configured} /></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field"><span className="label">{t("w.user")}</span>
          <input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={80} className="input" data-testid="pf-user" disabled={!configured} placeholder={(editMode || cred.saved) ? (cred.usernameHint ?? "") : ""} /></label>
        <label className="field"><span className="label">{t("w.pass")}</span>
          <span className="relative block">
            <input value={pass} onChange={(e) => setPass(e.target.value)} type={showPass ? "text" : "password"} autoComplete="new-password" autoCapitalize="none" spellCheck={false} maxLength={200} className="input !pr-12" data-testid="pf-pass" disabled={!configured} placeholder={(editMode || cred.saved) ? "••••••••" : ""} />
            <button type="button" onClick={() => setShowPass(!showPass)} aria-label={t(showPass ? "pf.hidePass" : "pf.showPass")} title={t(showPass ? "pf.hidePass" : "pf.showPass")} disabled={!configured}
              className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-[4px] text-mute transition-colors duration-150 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ice disabled:opacity-50" data-testid="pf-pass-eye">
              {showPass
                ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18" /><path d="M10.6 5.1A9.9 9.9 0 0 1 12 5c5 0 9 4.5 10 7a12.6 12.6 0 0 1-3.2 4.2" /><path d="M6.6 6.6C4.3 8 2.7 10.3 2 12c1 2.5 5 7 10 7a9.7 9.7 0 0 0 4.2-.9" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
                : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" /><circle cx="12" cy="12" r="3" /></svg>}
            </button>
          </span>
        </label>
      </div>
      {(editMode || cred.saved) && <p className="-mt-2 text-[13.5px] text-mute">{t("pf.keep")}</p>}
      <label className="flex cursor-pointer items-start gap-3 text-[14.5px] leading-snug text-fg">
        <input type="checkbox" className="mt-[3px] h-[18px] w-[18px] shrink-0 accent-ice" checked={ok} onChange={(e) => setOk(e.target.checked)} data-testid="pf-consent" disabled={!configured} />
        <span>{t("ml.consent")}</span>
      </label>
      {err && <div role="alert" className="field-error" data-testid="pf-error">{err}</div>}
    </div>
  );

  const note = !configured || !cred.storageOk ? <p role="status" className="field-error mb-4" data-testid="ml-notready">{t("ml.notReady")}</p> : null;

  const modals = (
    <>
      <Modal open={editing && !confirming} onClose={() => { if (!confirming) closeAll(); }} title={t("pf.editTitle")}>
        {note}
        <form onSubmit={submit} autoComplete="off" className="grid gap-4">
          {Fields(true)}
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={!canSend} className="btn-primary !h-11" data-testid="pf-save">{t("pf.save")}</button>
            <button type="button" onClick={closeAll} className="btn-line !h-11">{t("ml.cancel")}</button>
            <button type="button" onClick={remove} disabled={busy} className="btn-quiet !h-11 !text-mute" data-testid="pf-delete">{sure ? t("ml.removeSure") : t("ml.remove")}</button>
          </div>
        </form>
      </Modal>
      <Modal open={confirming} onClose={() => setConfirming(false)} title={t("pf.confirmTitle")}>
        <p className="mb-5 text-[15px] leading-snug text-fg [text-wrap:pretty]" data-testid="pf-confirm-text">{t("pf.confirmBody")}</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={send} disabled={busy} className="btn-primary !h-11" data-testid="pf-confirm">{busy ? t("set.saving") : t("pf.confirm")}</button>
          <button type="button" onClick={() => setConfirming(false)} className="btn-line !h-11" data-testid="pf-back">{t("pf.back")}</button>
        </div>
      </Modal>
    </>
  );

  // complete: a small summary on the side
  const bad = cred.verifyState === "bad_credentials" || cred.verifyState === "unknown" || cred.verifyState === "locked";
  const good = cred.verifyState === "ok" && !cred.blocked;
  const checking = CHECKING.includes(cred.verifyState);
  // what Merimen said about the login (and the code box when it asks for one)
  const stateBlock = (
      <div className="border-t border-hair px-4 py-2.5 text-[13.5px] text-mute">
        {checking && <p role="status">{t("w.checking")}</p>}
        {good && <p role="status">{t("w.ok")}{cred.updatedAt ? ` · ${t("ml.when", { when: whenOf(cred.updatedAt, lang) })}` : ""}</p>}
        {bad && <p role="alert" className="field-error">{cred.verifyState === "locked" ? t("w.locked") : t("w.bad")}</p>}
        {cred.verifyState === "otp" && (
          <form onSubmit={sendCode} className="grid gap-2">
            <p className="text-[14px] text-fg">{t("w.otp")}</p>
            <div className="flex gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" inputMode="numeric" maxLength={12} className="input min-w-0 flex-1" aria-label={t("w.otp")} data-testid="pf-otp" />
              <button type="submit" disabled={busy || !code} className="btn-primary !h-11">{t("w.otpGo")}</button>
            </div>
          </form>
        )}
        {!checking && !good && !bad && cred.verifyState !== "otp" && cred.updatedAt && <p>{t("ml.when", { when: whenOf(cred.updatedAt, lang) })}</p>}
      </div>
  );
  // not complete (or its own page): the whole form
  if (!compact || look === "page") {
    return (
      <section aria-labelledby="pf-title" className="rounded-[4px] border border-hair bg-panel p-5" data-testid="pf-form">
        <h2 id="pf-title" className="text-[18px] font-semibold leading-snug text-fg">{t("pf.title")}</h2>
        {/* "no case until it is complete" only while it is not; the page itself is enough when it is */}
        {!cred.complete ? <p className="mb-4 mt-1 text-[14.5px] leading-snug text-mute [text-wrap:pretty]">{t("pf.lead")}</p> : <div className="mb-4" />}
        {note}
        <form onSubmit={submit} autoComplete="off" className="grid gap-4">
          {Fields(false)}
          <div className="flex flex-wrap items-center gap-2"><button type="submit" disabled={!canSend} className="btn-primary !h-12 w-full sm:w-auto sm:px-8" data-testid="pf-save">{busy ? t("set.saving") : t("pf.save")}</button>
            {cred.saved && <button type="button" onClick={remove} disabled={busy} className="btn-quiet !h-12 !text-mute sm:ml-3" data-testid="pf-delete">{sure ? t("ml.removeSure") : t("ml.remove")}</button>}
          </div>
        </form>
      {look === "page" && cred.saved && <div className="-mx-5 -mb-5 mt-5">{stateBlock}</div>}
      {look === "page" && modals}
      </section>
    );
  }

  const rowCls = "flex flex-wrap items-baseline justify-between gap-x-3 border-b border-hair px-4 py-2.5 last:border-b-0";
  return (
    <section aria-labelledby="pf-title" className="rounded-[4px] border border-hair bg-panel" data-testid="pf-summary">
      <div className="flex items-center justify-between gap-3 border-b border-hair bg-panel2 px-4 py-3">
        <h2 id="pf-title" className="text-[15px] font-semibold leading-none text-fg">{t("pf.title")}</h2>
        <button type="button" onClick={openEdit} className="btn-line !h-9 !px-4 !text-[14px]" data-testid="pf-edit">{t("pf.edit")}</button>
      </div>
      <dl>
        {([...((cred.workshops?.length ? cred.workshops : [{ slot: 1, name: cred.workshop ?? "" }]).map((w) => [t("pf.wsN", { n: String(w.slot) }), w.name])), [t("pf.manager"), cred.manager], [t("pf.adjuster"), cred.adjuster], [t("pf.login"), cred.usernameHint]] as [string, string | null][]).map(([k, v]) => (
          <div key={k} className={rowCls}><dt className="note text-mute">{k}</dt><dd className="min-w-0 text-[14.5px] text-fg [overflow-wrap:anywhere]">{v}</dd></div>
        ))}
      </dl>
      {stateBlock}
      {modals}
    </section>
  );
}
