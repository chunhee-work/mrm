"use client";
import { useState } from "react";
import { useT } from "@/components/lang-provider";
import type { ExtState } from "@/lib/ext/gate";

// The Connection card (plan #38, P1). With the feature off it only says "not available yet": no button, no form.
export default function Connection({ state: initial }: { state: ExtState }) {
  const { t } = useT();
  const [state, setState] = useState<ExtState>(initial);
  const [ok, setOk] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  async function consent() {
    if (!ok || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/ext/consent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: true, firmLabel: label || undefined }) });
      if (r.ok) setState("ready"); else setErr(t("conn.err"));
    } catch { setErr(t("conn.err")); } finally { setBusy(false); }
  }
  async function getCode() {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/ext/pair/code", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.code) setCode(j.code); else setErr(t(r.status === 429 ? "conn.err.rate" : "conn.err"));
    } catch { setErr(t("conn.err")); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-8">
      <h1 className="text-[26px] font-semibold leading-tight text-fg">{t("conn.title")}</h1>
      <p className="mt-2 text-[15px] text-mute">{t("conn.intro")}</p>
      <section aria-labelledby="conn-card" className="mt-5 rounded-[3px] border border-hair bg-panel p-5">
        <h2 id="conn-card" className="text-[13px] font-semibold uppercase tracking-wide text-mute">{t("conn.card")}</h2>
        {state === "off" && (
          <div className="mt-3">
            <div className="text-[17px] font-semibold text-fg">{t("conn.off")}</div>
            <p className="mt-1 text-[14px] text-mute">{t("conn.offSub")}</p>
          </div>
        )}
        {state === "needs_consent" && (
          <div className="mt-3">
            <div className="text-[17px] font-semibold text-fg">{t("conn.consentTitle")}</div>
            <label className="mt-3 flex cursor-pointer items-start gap-3 text-[15px] text-fg">
              <input type="checkbox" className="mt-1 accent-ice" checked={ok} onChange={(e) => setOk(e.target.checked)} />
              <span>{t("conn.consentLine")}</span>
            </label>
            <label className="mt-4 block text-[14px] text-mute">{t("conn.label")}
              <input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} className="mt-1 block h-11 w-full rounded-[3px] border border-hair bg-white px-3 text-[15px] text-fg" />
            </label>
            {err && <div role="alert" className="mt-3 text-[14px] font-semibold text-fg">⚠ {err}</div>}
            <button type="button" onClick={consent} disabled={!ok || busy} className="btn-primary mt-4 !h-12 w-full sm:w-auto sm:px-8">{t("conn.consentGo")}</button>
          </div>
        )}
        {state === "ready" && (
          <div className="mt-3">
            <div className="text-[17px] font-semibold text-fg">{t("conn.ready")}</div>
            <p className="mt-1 text-[14px] text-mute">{t("conn.desktop")}</p>
            {code && <div className="mt-4 rounded-[3px] border border-hair bg-white px-4 py-3 text-center font-mono text-[28px] font-semibold tracking-[0.2em] text-fg" aria-live="polite">{code}</div>}
            {code && <p className="mt-2 text-[13px] text-mute">{t("conn.codeHint")}</p>}
            {err && <div role="alert" className="mt-3 text-[14px] font-semibold text-fg">⚠ {err}</div>}
            <button type="button" onClick={getCode} disabled={busy} className="btn-primary mt-4 !h-12 w-full sm:w-auto sm:px-8">{t("conn.code")}</button>
          </div>
        )}
      </section>
    </div>
  );
}
