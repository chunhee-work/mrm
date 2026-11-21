"use client";
import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/components/lang-provider";
import { LANGS, LANG_LABEL } from "@/lib/i18n";
import { useRouter } from "next/navigation";

export default function Settings({ email, company }: { email: string; company: string }) {
  const { t, lang } = useT();
  const router = useRouter();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (next.length < 8) { setMsg({ ok: false, text: t("set.pwShort") }); return; }
    setBusy(true); setMsg(null);
    try {
      const { error } = await authClient.changePassword({ currentPassword: cur, newPassword: next, revokeOtherSessions: true });
      if (error) setMsg({ ok: false, text: t("set.pwWrong") });
      else { setMsg({ ok: true, text: t("set.pwDone") }); setCur(""); setNext(""); }
    } catch { setMsg({ ok: false, text: t("set.pwWrong") }); }
    setBusy(false);
  }
  function pick(l: string) {
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
            <div className={row}><dt className="note text-mute">{t("set.company")}</dt><dd className="min-w-0 text-[15px] text-fg [overflow-wrap:anywhere]">{company || "—"}</dd></div>
          </dl>
        </section>

        <section aria-labelledby="set-lang">
          <h2 id="set-lang" className="label mb-3">{t("set.language")}</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="set-lang">
            {LANGS.map((l) => (
              <button key={l} type="button" aria-pressed={l === lang} onClick={() => pick(l)} className={l === lang ? "btn-primary !h-11" : "btn-line !h-11"}>{LANG_LABEL[l]}</button>
            ))}
          </div>
        </section>

        <section aria-labelledby="set-merimen">
          <h2 id="set-merimen" className="label mb-3">{t("set.merimen")}</h2>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-hair bg-panel px-4 py-3">
            <p className="min-w-0 text-[14.5px] text-mute">{t("set.merimenSub")}</p>
            <Link href="/connection" className="btn-line !h-11">{t("conn.title")}</Link>
          </div>
        </section>

        <section aria-labelledby="set-pw">
          <h2 id="set-pw" className="label mb-3">{t("set.password")}</h2>
          <form onSubmit={changePw} className="grid gap-4 rounded-[4px] border border-hair bg-panel p-4">
            <label className="field"><span className="label">{t("set.pwCurrent")}</span>
              <input type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} className="input" /></label>
            <label className="field"><span className="label">{t("set.pwNew")}</span>
              <input type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} className="input" /></label>
            {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-[14px] font-semibold text-go" : "field-error"}>{msg.text}</p>}
            <div><button className="btn-primary" disabled={busy}>{busy ? t("set.saving") : t("set.pwSave")}</button></div>
          </form>
        </section>

        <section aria-labelledby="set-delete">
          <h2 id="set-delete" className="label mb-3">{t("set.delete")}</h2>
          <p className="rounded-[4px] border border-hair bg-panel px-4 py-3 text-[14.5px] text-mute">{t("set.deleteSub")}</p>
        </section>
      </div>
    </div>
  );
}
