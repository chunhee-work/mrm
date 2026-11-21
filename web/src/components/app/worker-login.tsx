"use client";
import { useEffect, useState } from "react";
import { useT } from "@/components/lang-provider";

export type Cred = { saved: boolean; usernameHint: string | null; verifyState: string; blocked: boolean };

// The Merimen login the user types themselves. The worker checks it once. This page never shows the password again.
export default function WorkerLogin({ initial }: { initial: Cred }) {
  const { t } = useT();
  const [cred, setCred] = useState<Cred>(initial);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (cred.verifyState !== "queued" && cred.verifyState !== "checking" && cred.verifyState !== "otp_submitted") return;
    const id = setInterval(async () => {
      try {
        const r = await fetch("/api/ext/worker/credentials");
        if (r.ok) setCred(await r.json());
      } catch { /* next tick */ }
    }, 2000);
    return () => clearInterval(id);
  }, [cred.verifyState]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/ext/worker/credentials", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: user, password: pass }) });
      if (!r.ok) setErr(t("w.err"));
      else { const b = await r.json(); setPass(""); setCred({ saved: true, usernameHint: b.usernameHint ?? null, verifyState: "queued", blocked: cred.blocked }); }
    } catch { setErr(t("w.err")); } finally { setBusy(false); }
  }
  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !code) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/ext/worker/otp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
      if (!r.ok) setErr(t("w.err"));
      else { setCode(""); setCred({ ...cred, verifyState: "otp_submitted" }); }
    } catch { setErr(t("w.err")); } finally { setBusy(false); }
  }
  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/ext/worker/credentials", { method: "DELETE" });
      if (r.ok) setCred({ saved: false, usernameHint: null, verifyState: "none", blocked: false });
    } finally { setBusy(false); }
  }

  const checking = cred.verifyState === "queued" || cred.verifyState === "checking" || cred.verifyState === "otp_submitted";
  const bad = cred.verifyState === "bad_credentials" || cred.verifyState === "unknown";
  return (
    <div className="mt-3">
      <p className="text-[14px] text-mute">{t("w.lead")}</p>
      {checking && <p role="status" className="mt-3 text-[15px] font-semibold text-fg">{t("w.checking")}</p>}
      {cred.verifyState === "ok" && !cred.blocked && <p role="status" className="mt-3 text-[15px] font-semibold text-fg">{t("w.ok")}</p>}
      {bad && !checking && <div role="alert" className="mt-3 rounded-[3px] border border-hair bg-ambertint px-3 py-2 text-[15px] text-fg">{t("w.bad")}</div>}
      {cred.verifyState === "locked" && <div role="alert" className="mt-3 rounded-[3px] border border-hair bg-ambertint px-3 py-2 text-[15px] text-fg">{t("w.locked")}</div>}
      {cred.verifyState === "otp" && (
        <form onSubmit={sendCode} className="mt-3">
          <p className="text-[15px] text-fg">{t("w.otp")}</p>
          <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" inputMode="numeric" maxLength={12} className="mt-2 block h-11 w-full rounded-[3px] border border-hair bg-white px-3 text-[15px] text-fg sm:w-48" aria-label={t("w.otp")} />
          <button type="submit" disabled={busy || !code} className="btn-primary mt-3 !h-11">{t("w.otpGo")}</button>
        </form>
      )}
      {cred.saved && <p className="mt-3 text-[14px] text-mute">{t("w.saved")} {cred.usernameHint}</p>}
      <form onSubmit={save} className="mt-4 grid gap-3">
        <label className="text-[14px] text-mute">{t("w.user")}
          <input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" maxLength={80} className="mt-1 block h-11 w-full rounded-[3px] border border-hair bg-white px-3 text-[15px] text-fg" />
        </label>
        <label className="text-[14px] text-mute">{t("w.pass")}
          <input value={pass} onChange={(e) => setPass(e.target.value)} type="password" autoComplete="current-password" maxLength={200} className="mt-1 block h-11 w-full rounded-[3px] border border-hair bg-white px-3 text-[15px] text-fg" />
        </label>
        {err && <div role="alert" className="text-[14px] font-semibold text-fg">⚠ {err}</div>}
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={busy || !user || !pass} className="btn-primary !h-11">{t("w.save")}</button>
          {cred.saved && <button type="button" onClick={remove} disabled={busy} className="h-11 rounded-[3px] border border-hair bg-white px-4 text-[15px] font-semibold text-fg">{t("w.delete")}</button>}
        </div>
      </form>
    </div>
  );
}
