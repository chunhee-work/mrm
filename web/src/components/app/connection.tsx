"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/lang-provider";
import type { ExtState } from "@/lib/ext/gate";
import Link from "next/link";
import type { Cred } from "./profile-card";

// The Connection card (plan #38, P1). With the feature off it only says "not available yet": no button, no form.
type View =
  | { state: "unavailable" } | { state: "idle" } | { state: "in_use" }
  | { state: "open"; status: "none" | "waiting_login" | "connected" | "expired"; liveView: string };

type Plan = { steps: { code: string; ok: boolean; missing: string[] }[]; allReady: boolean };

export default function Connection({ state: initial, embedded = false, cases = [], mode = "browser", cred = null }: { state: ExtState; embedded?: boolean; cases?: { id: string; plate: string }[]; mode?: "browser" | "worker"; cred?: Cred | null }) {
  const { t } = useT();
  const [state, setState] = useState<ExtState>(initial);
  const [ok, setOk] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [pick, setPick] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const wanted = useRef(""); // the case whose preview we are waiting for; an answer for any other case is dropped

  // While the window is open the page asks for its state every 4 seconds (this also keeps it from closing as idle).
  useEffect(() => {
    if (state !== "ready") return;
    let stop = false;
    const tick = async () => {
      try { const r = await fetch("/api/ext/browser/status"); if (r.ok && !stop) setView(await r.json()); } catch { /* next tick */ }
    };
    tick();
    const id = setInterval(() => { if (view?.state === "open" || view?.state === "in_use") tick(); }, 4000);
    return () => { stop = true; clearInterval(id); };
  }, [state, view?.state]);

  async function consent() {
    if (!ok || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/ext/consent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: true, firmLabel: label || undefined }) });
      if (r.ok) setState("ready"); else setErr(t("conn.err"));
    } catch { setErr(t("conn.err")); } finally { setBusy(false); }
  }
  async function act(path: "open" | "close") {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/ext/browser/${path}`, { method: "POST" });
      if (r.ok) setView(await r.json()); else setErr(t("conn.err"));
    } catch { setErr(t("conn.err")); } finally { setBusy(false); }
  }

  async function preview() {
    if (!pick || busy) return;
    const asked = pick; wanted.current = asked;
    setBusy(true); setErr(null); setPlan(null);
    try {
      const r = await fetch("/api/ext/dryrun", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ caseId: asked }) });
      if (wanted.current !== asked) return;
      if (r.ok) setPlan(await r.json()); else setErr(t("conn.err"));
    } catch { setErr(t("conn.err")); } finally { setBusy(false); }
  }

  const open = view?.state === "open" ? view : null;
  // U10: while the feature is off there is nothing to do here. On the dashboard it is a small line, not a card, and the
  // Connection page shows only the card text (its intro describes a window that does not exist yet).
  if (embedded && state === "off") return <p className="note text-mute">{t("conn.card")} · {t("conn.off")}</p>;
  return (
    <div className={embedded ? "w-full" : "mx-auto w-full max-w-[880px] px-4 py-8"}>
      {!embedded && <h1 className="text-[26px] font-semibold leading-tight text-fg">{t("conn.title")}</h1>}
      {!embedded && state !== "off" && <p className="mt-2 text-[15px] text-mute">{t("conn.intro")}</p>}
      <section aria-labelledby="conn-card" className={(embedded ? "" : "mt-5 ") + "rounded-[3px] border border-hair bg-panel p-5"}>
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
        {state === "ready" && mode === "worker" && cred && <Link href="/dashboard" className="btn-line mt-3 !h-11">{t("pf.title")}</Link>}
        {state === "ready" && mode !== "worker" && (
          <div className="mt-3">
            <div className="text-[17px] font-semibold text-fg">
              {view?.state === "unavailable" ? t("conn.unavailable")
                : view?.state === "in_use" ? t("conn.inUse")
                : open?.status === "connected" ? t("conn.connected")
                : open?.status === "expired" ? t("conn.expired")
                : open ? t("conn.waiting") : t("conn.ready")}
            </div>
            <p className="mt-1 text-[14px] text-mute">{view?.state === "unavailable" ? t("conn.unavailableSub") : open?.status === "connected" ? t("conn.connectedHint") : open ? t("conn.loginHint") : t("conn.openHint")}</p>
            {open && (
              <iframe
                title={t("conn.frame")}
                src={open.liveView}
                sandbox="allow-same-origin allow-scripts allow-forms"
                referrerPolicy="no-referrer"
                className="mt-4 hidden h-[560px] w-full rounded-[3px] border border-hair bg-white md:block"
              />
            )}
            {open?.status === "connected" && (
              <div className="mt-5 border-t border-hair pt-4">
                <h3 className="text-[15px] font-semibold text-fg">{t("dry.title")}</h3>
                <p className="mt-1 text-[14px] text-mute">{t("dry.sub")}</p>
                {cases.length === 0 ? <p className="mt-3 text-[14px] text-mute">{t("dry.noCases")}</p> : (
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                    <select value={pick} disabled={busy} onChange={(e) => { wanted.current = e.target.value; setPick(e.target.value); setPlan(null); }} aria-label={t("dry.pick")} className="h-11 rounded-[3px] border border-hair bg-white px-3 text-[15px] text-fg sm:w-64">
                      <option value="">{t("dry.pick")}</option>
                      {cases.map((c) => <option key={c.id} value={c.id}>{c.plate || c.id}</option>)}
                    </select>
                    <button type="button" onClick={preview} disabled={!pick || busy} className="btn-primary !h-11 sm:px-6">{t("dry.go")}</button>
                  </div>
                )}
                {plan && (
                  <div className="mt-4">
                    <div className="text-[15px] font-semibold text-fg">{plan.allReady ? t("dry.allReady") : t("dry.blocked")}</div>
                    <ol className="mt-2 divide-y divide-hair rounded-[3px] border border-hair bg-white">
                      {plan.steps.map((s, n) => (
                        <li key={s.code} className="flex items-start gap-3 px-3 py-2.5 text-[15px]">
                          <span className="mt-0.5 w-5 shrink-0 text-mute">{n + 1}</span>
                          <span className="min-w-0 flex-1">
                            <span className="text-fg">{t(`dry.step.${s.code}`)}</span>
                            {!s.ok && <span className="mt-0.5 block text-[14px] text-mute">{t("dry.missing")}: {s.missing.map((m) => t(`dry.f.${m}`)).join(", ")}</span>}
                          </span>
                          <span className={s.ok ? "text-fg" : "text-mute"}>{s.ok ? `✓ ${t("dry.ok")}` : "⚠"}</span>
                        </li>
                      ))}
                    </ol>
                    <p className="mt-2 text-[14px] text-mute">{t("dry.nothing")}</p>
                  </div>
                )}
              </div>
            )}
            {open && <p className="mt-3 text-[14px] text-mute md:hidden">{t("conn.desktop")}</p>}
            {err && <div role="alert" className="mt-3 text-[14px] font-semibold text-fg">⚠ {err}</div>}
            {view?.state !== "unavailable" && view?.state !== "in_use" && (
              open
                ? <button type="button" onClick={() => act("close")} disabled={busy} className="mt-4 h-12 w-full rounded-[3px] border border-hair bg-white px-8 text-[15px] font-semibold text-fg sm:w-auto">{t("conn.close")}</button>
                : <button type="button" onClick={() => act("open")} disabled={busy} className="btn-primary mt-4 !h-12 w-full sm:w-auto sm:px-8">{t("conn.open")}</button>
            )}
            {!open && <p className="mt-3 text-[14px] text-mute md:hidden">{t("conn.desktop")}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
