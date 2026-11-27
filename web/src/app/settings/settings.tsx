"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/components/lang-provider";
import { LANGS, LANG_LABEL, MAX_PASSWORD, type Lang } from "@/lib/i18n";

export default function Settings({ email, company }: { email: string; company: string }) {
  const { t, lang } = useT();
  const router = useRouter();
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
    if (next.length > MAX_PASSWORD) { setMsg({ ok: false, key: "signup.passwordLong" }); return; }
    if (next !== again) { setMsg({ ok: false, key: "set.pwMismatch" }); return; }
    setBusy(true); setMsg(null);
    try {
      const { error } = await authClient.changePassword({ currentPassword: cur, newPassword: next, revokeOtherSessions: true });
      if (error) setMsg({ ok: false, key: error.status === 429 ? "auth.tooMany" : error.code === "PASSWORD_TOO_LONG" ? "signup.passwordLong" : error.status && error.status < 500 ? "set.pwWrong" : "login.offline" });
      else { setMsg({ ok: true, key: "set.pwDone" }); setCur(""); setNext(""); setAgain(""); }
    } catch { setMsg({ ok: false, key: "set.pwWrong" }); }
    setBusy(false);
  }
  function pickLang(l: Lang) {
    document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
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
            {company && <div className={row}><dt className="note text-mute">{t("set.company")}</dt><dd className="min-w-0 text-[15px] text-fg [overflow-wrap:anywhere]">{company}</dd></div>}
          </dl>
        </section>

        {/* the language lives here and nowhere else on a wide screen (owner 2026-11-22: "language hide in setting");
            a phone also has it as a row of its menu */}
        <section aria-labelledby="set-lang">
          <h2 id="set-lang" className="label mb-3">{t("lang.label")}</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="set-lang" data-testid="set-lang">
            {LANGS.map((l) => (
              <button key={l} type="button" lang={l === "zh" ? "zh-CN" : l} aria-pressed={l === lang} onClick={() => pickLang(l)} className={l === lang ? "btn-primary !h-11" : "btn-line !h-11"}>{LANG_LABEL[l]}</button>
            ))}
          </div>
        </section>

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
