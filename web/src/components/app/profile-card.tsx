"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/lang-provider";
import { whenOf } from "@/lib/fmt-when";

export type Cred = {
  saved: boolean; usernameHint: string | null; verifyState: string; blocked: boolean; updatedAt?: string | null;
  workshop: string | null; manager: string | null; adjuster: string | null; complete: boolean; storageOk: boolean;
};

const CHECKING = ["queued", "checking", "otp_submitted"];

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
export default function ProfileCard({ cred, setCred, onSaved, configured, compact }: { cred: Cred; setCred: (c: Cred) => void; onSaved?: () => void; configured: boolean; compact: boolean }) {
  const { t, lang } = useT();
  const [workshop, setWorkshop] = useState("");
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

  // poll while the worker checks the login
  useEffect(() => {
    if (!CHECKING.includes(cred.verifyState)) return;
    const id = setInterval(async () => {
      try { const r = await fetch("/api/ext/worker/credentials"); if (r.ok) setCred(await r.json()); } catch { /* next tick */ }
    }, 2000);
    return () => clearInterval(id);
  }, [cred.verifyState, setCred]);

  function fill() { setWorkshop(cred.workshop ?? ""); setManager(cred.manager ?? ""); setAdjuster(cred.adjuster ?? ""); setUser(""); setPass(""); setOk(false); setErr(null); setSure(false); }
  function openEdit() { fill(); setEditing(true); }
  function closeAll() { setEditing(false); setConfirming(false); setPass(""); setSure(false); }

  const first = !cred.saved;
  const loginTyped = !!(user || pass);
  const canSend = configured && cred.storageOk && !busy && ok && !!workshop.trim() && !!manager.trim() && !!adjuster.trim()
    && (first ? !!user && !!pass : (!loginTyped || (!!user && !!pass)));

  // first time: send at once. An edit: ask in a pop-up first.
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    if (first) void send(); else setConfirming(true);
  }
  async function send() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/ext/worker/credentials", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workshop, manager, adjuster, ...(loginTyped ? { username: user, password: pass } : {}), consent: true }) });
      if (r.status === 503) { setErr(t("ml.notReady")); setConfirming(false); }
      else if (!r.ok) { setErr(t("w.err")); setConfirming(false); }
      else { setCred(await r.json()); closeAll(); fill(); onSaved?.(); }
    } catch { setErr(t("w.err")); setConfirming(false); } finally { setPass(""); setBusy(false); }
  }
  async function remove() {
    if (busy) return;
    if (!sure) { setSure(true); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/ext/worker/credentials", { method: "DELETE" });
      if (r.ok) { setCred({ ...cred, saved: false, usernameHint: null, verifyState: "none", blocked: false, updatedAt: null, workshop: null, manager: null, adjuster: null, complete: false }); closeAll(); fill(); onSaved?.(); }
    } finally { setBusy(false); setSure(false); }
  }

  const Fields = (editMode: boolean) => (
    <div className="grid gap-4" data-testid="pf-fields">
      <label className="field"><span className="label">{t("pf.workshop")}</span>
        <input value={workshop} onChange={(e) => setWorkshop(e.target.value)} maxLength={120} autoComplete="organization" className="input" data-testid="pf-workshop" disabled={!configured} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field"><span className="label">{t("pf.manager")}</span>
          <input value={manager} onChange={(e) => setManager(e.target.value)} maxLength={120} autoComplete="off" className="input" data-testid="pf-manager" disabled={!configured} /></label>
        <label className="field"><span className="label">{t("pf.adjuster")}</span>
          <input value={adjuster} onChange={(e) => setAdjuster(e.target.value)} maxLength={120} autoComplete="off" className="input" data-testid="pf-adjuster" disabled={!configured} /></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field"><span className="label">{t("w.user")}</span>
          <input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={80} className="input" data-testid="pf-user" disabled={!configured} placeholder={editMode ? (cred.usernameHint ?? "") : ""} /></label>
        <label className="field"><span className="label">{t("w.pass")}</span>
          <input value={pass} onChange={(e) => setPass(e.target.value)} type="password" autoComplete="new-password" maxLength={200} className="input" data-testid="pf-pass" disabled={!configured} placeholder={editMode ? "••••••••" : ""} /></label>
      </div>
      {editMode && <p className="-mt-2 text-[13.5px] text-mute">{t("pf.keep")}</p>}
      <label className="flex cursor-pointer items-start gap-3 text-[14.5px] leading-snug text-fg">
        <input type="checkbox" className="mt-[3px] h-[18px] w-[18px] shrink-0 accent-ice" checked={ok} onChange={(e) => setOk(e.target.checked)} data-testid="pf-consent" disabled={!configured} />
        <span>{t("ml.consent")}</span>
      </label>
      {err && <div role="alert" className="field-error" data-testid="pf-error">{err}</div>}
    </div>
  );

  const note = !configured || !cred.storageOk ? <p role="status" className="field-error mb-4" data-testid="ml-notready">{t("ml.notReady")}</p> : null;

  // not complete: the whole form, on the page
  if (!compact) {
    return (
      <section aria-labelledby="pf-title" className="rounded-[4px] border border-hair bg-panel p-5" data-testid="pf-form">
        <h2 id="pf-title" className="text-[18px] font-semibold leading-snug text-fg">{t("pf.title")}</h2>
        <p className="mb-4 mt-1 text-[14.5px] leading-snug text-mute [text-wrap:pretty]">{t("pf.lead")}</p>
        {note}
        <form onSubmit={submit} autoComplete="off" className="grid gap-4">
          {Fields(false)}
          <div><button type="submit" disabled={!canSend} className="btn-primary !h-12 w-full sm:w-auto sm:px-8" data-testid="pf-save">{busy ? t("set.saving") : t("pf.save")}</button></div>
        </form>
      </section>
    );
  }

  // complete: a small summary on the side
  const bad = cred.verifyState === "bad_credentials" || cred.verifyState === "unknown" || cred.verifyState === "locked";
  const good = cred.verifyState === "ok" && !cred.blocked;
  const checking = CHECKING.includes(cred.verifyState);
  const rowCls = "flex flex-wrap items-baseline justify-between gap-x-3 border-b border-hair px-4 py-2.5 last:border-b-0";
  return (
    <section aria-labelledby="pf-title" className="rounded-[4px] border border-hair bg-panel" data-testid="pf-summary">
      <div className="flex items-center justify-between gap-3 border-b border-hair bg-panel2 px-4 py-3">
        <h2 id="pf-title" className="text-[15px] font-semibold leading-none text-fg">{t("pf.title")}</h2>
        <button type="button" onClick={openEdit} className="btn-line !h-9 !px-4 !text-[14px]" data-testid="pf-edit">{t("pf.edit")}</button>
      </div>
      <dl>
        {([["pf.workshop", cred.workshop], ["pf.manager", cred.manager], ["pf.adjuster", cred.adjuster], ["pf.login", cred.usernameHint]] as [string, string | null][]).map(([k, v]) => (
          <div key={k} className={rowCls}><dt className="note text-mute">{t(k)}</dt><dd className="min-w-0 text-[14.5px] text-fg [overflow-wrap:anywhere]">{v}</dd></div>
        ))}
      </dl>
      <div className="border-t border-hair px-4 py-2.5 text-[13.5px] text-mute">
        {checking && <p role="status">{t("w.checking")}</p>}
        {good && <p role="status">{t("w.ok")}{cred.updatedAt ? ` · ${t("ml.when", { when: whenOf(cred.updatedAt, lang) })}` : ""}</p>}
        {bad && <p role="alert" className="field-error">{cred.verifyState === "locked" ? t("w.locked") : t("w.bad")}</p>}
        {!checking && !good && !bad && cred.updatedAt && <p>{t("ml.when", { when: whenOf(cred.updatedAt, lang) })}</p>}
      </div>
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
    </section>
  );
}
