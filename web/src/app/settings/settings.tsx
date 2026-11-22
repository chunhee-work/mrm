"use client";
import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/components/lang-provider";

export default function Settings({ email, company, connection = false }: { email: string; company: string; connection?: boolean }) {
  const { t } = useT();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  // the message is kept as a key, so it is written again in the new language when the page language changes (R3-B09)
  const [msg, setMsg] = useState<{ ok: boolean; key: string } | null>(null);

  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!cur) { setMsg({ ok: false, key: "set.pwNoCurrent" }); return; }
    if (next.length < 8) { setMsg({ ok: false, key: "set.pwShort" }); return; }
    if (next !== again) { setMsg({ ok: false, key: "set.pwMismatch" }); return; }
    setBusy(true); setMsg(null);
    try {
      const { error } = await authClient.changePassword({ currentPassword: cur, newPassword: next, revokeOtherSessions: true });
      if (error) setMsg({ ok: false, key: "set.pwWrong" });
      else { setMsg({ ok: true, key: "set.pwDone" }); setCur(""); setNext(""); setAgain(""); }
    } catch { setMsg({ ok: false, key: "set.pwWrong" }); }
    setBusy(false);
  }
  const row = "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hair px-4 py-3 last:border-b-0";
  return (
    <div className="wrap py-8 lg:py-12">
      <h1 className="display-2 mb-6 text-[30px] text-fg lg:text-[36px]">{t("set.title")}</h1>
      <div className="grid max-w-[720px] gap-8">
        <section aria-labelledby="set-acct">
          <h2 id="set-acct" className="label mb-3">{t("set.account")}</h2>
          <dl className="rounded-[4px] border border-hair bg-panel">
            <div className={row}><dt className="note text-mute">{t("set.email")}</dt><dd className="min-w-0 text-[15px] text-fg [overflow-wrap:anywhere]">{email}</dd></div>
            <div className={row}><dt className="note text-mute">{t("set.company")}</dt><dd className="min-w-0 text-[15px] text-fg [overflow-wrap:anywhere]">{company || "—"}</dd></div>
          </dl>
        </section>

        {/* the language is the globe in the top bar on every page (a phone: in the menu), so it is not repeated here;
            the Merimen connection shows only once there is something to set up */}
        {connection && (
          <section aria-labelledby="set-merimen">
            <h2 id="set-merimen" className="label mb-3">{t("set.merimen")}</h2>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-hair bg-panel px-4 py-3">
              <p className="min-w-0 text-[14.5px] text-mute">{t("set.merimenSub")}</p>
              <Link href="/connection" className="btn-line !h-11">{t("conn.title")}</Link>
            </div>
          </section>
        )}

        <section aria-labelledby="set-pw">
          <h2 id="set-pw" className="label mb-3">{t("set.password")}</h2>
          {/* rarely needed: one row with one button until it is opened */}
          {!pwOpen ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-hair bg-panel px-4 py-3">
              <p className="min-w-0 font-mono text-[15px] tracking-[0.2em] text-mute" aria-hidden="true">••••••••</p>
              <button type="button" className="btn-line !h-11" onClick={() => setPwOpen(true)} data-testid="pw-open">{t("set.pwChange")}</button>
            </div>
          ) : (
          <form onSubmit={changePw} noValidate className="grid gap-4 rounded-[4px] border border-hair bg-panel p-4">
            <label className="field"><span className="label">{t("set.pwCurrent")}</span>
              <input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} className="input" /></label>
            <label className="field"><span className="label">{t("set.pwNew")}</span>
              <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className="input" /></label>
            <label className="field"><span className="label">{t("set.pwConfirm")}</span>
              <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className="input" data-testid="pw-confirm" /></label>
            {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-[14px] font-semibold text-go" : "field-error"}>{t(msg.key)}</p>}
            <div><button className="btn-primary" disabled={busy}>{busy ? t("set.saving") : t("set.pwSave")}</button></div>
          </form>
          )}
        </section>

        <section aria-labelledby="set-delete">
          <h2 id="set-delete" className="label mb-3">{t("set.delete")}</h2>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-hair bg-panel px-4 py-3">
            <p className="min-w-0 flex-1 basis-[260px] text-[14.5px] text-mute">{t("set.deleteSub")}</p>
            <Link href="/contact" className="btn-line !h-11">{t("nav.contact")}</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
