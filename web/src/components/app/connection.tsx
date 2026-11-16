"use client";
import { useEffect, useState } from "react";
import { useT } from "@/components/lang-provider";
import type { ExtState } from "@/lib/ext/gate";

// The Connection card (plan #38, P1). With the feature off it only says "not available yet": no button, no form.
type View =
  | { state: "unavailable" } | { state: "idle" } | { state: "in_use" }
  | { state: "open"; status: "none" | "waiting_login" | "connected" | "expired"; liveView: string };

export default function Connection({ state: initial }: { state: ExtState }) {
  const { t } = useT();
  const [state, setState] = useState<ExtState>(initial);
  const [ok, setOk] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);

  // While the window is open the page asks for its state every 4 seconds (this also keeps it from closing as idle).
  useEffect(() => {
    if (state !== "ready") return;
    let stop = false;
    const tick = async () => {
      try { const r = await fetch("/api/ext/browser/status"); if (r.ok && !stop) setView(await r.json()); } catch { /* next tick */ }
    };
    tick();
    const id = setInterval(() => { if (view?.state === "open") tick(); }, 4000);
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

  const open = view?.state === "open" ? view : null;
  return (
    <div className="mx-auto w-full max-w-[880px] px-4 py-8">
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
