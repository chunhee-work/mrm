"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { Crop } from "@/components/app/marks";
import { StatusMark } from "@/components/app/status";

export type CaseDetail = {
  id: string;
  plate: string;
  status: string;
  error: string | null;
  insurer: string | null;
  carModel: string | null;
  missing: string[];
  fileCount: number;
  facts: { owner: string; policyNo: string | null; policeReport: string | null; accidentAt: string | null; atFaultPlate: string | null; atFaultInsurer: string | null } | null;
  events: { at: string; message: string }[];
  lastEventAt: string | null;
  now: number;
};

const REFRESH_MS = 5_000;
const STUCK_MS = 6 * 60_000; // the read runs at most 5 minutes; after that "reading" means it died

export default function CaseView({ c }: { c: CaseDetail }) {
  const { t } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [now, setNow] = useState(c.now);

  const working = c.status === "uploaded" || c.status === "reading";
  useEffect(() => {
    if (!working) return;
    const id = window.setInterval(() => { if (!document.hidden) { setNow(Date.now()); router.refresh(); } }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [working, router]);
  useEffect(() => setNow(Date.now()), [c.now]);

  const stuck = c.status === "reading" && c.lastEventAt !== null && now - Date.parse(c.lastEventAt) > STUCK_MS;
  const canRetry = c.status === "failed" || stuck;

  async function retry() {
    setBusy(true); setErr(false);
    try {
      const r = await fetch(`/api/cases/${c.id}/scan`, { method: "POST" });
      if (!r.ok) setErr(true);
    } catch { setErr(true); }
    setBusy(false);
    router.refresh();
  }

  const rows: [string, string | null][] = [
    [t("case.plate"), c.plate],
    [t("case.insurer"), c.insurer],
    [t("case.model"), c.carModel],
    ...(c.facts ? ([
      [t("case.owner"), c.facts.owner],
      [t("case.policy"), c.facts.policyNo],
      [t("case.police"), c.facts.policeReport],
      [t("case.accident"), c.facts.accidentAt],
      [t("case.atFault"), [c.facts.atFaultPlate, c.facts.atFaultInsurer].filter(Boolean).join(" · ") || null],
    ] as [string, string | null][]) : []),
  ];

  return (
    <div className="wrap flex flex-1 flex-col pb-10 pt-6 lg:pb-14 lg:pt-9">
      <Link href="/dashboard" className="btn-quiet mb-4 self-start">{t("case.back")}</Link>
      <div className="relative mx-auto w-full max-w-[860px]">
        <Crop />
        <div className="rounded-[4px] border border-hair bg-white">
          <div className="flex min-h-[60px] flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-hair px-5 py-3 sm:min-h-[68px] sm:px-8">
            <h1 className="display-2 num font-mono text-[24px] text-ink sm:text-[28px]">{c.plate}</h1>
            <div aria-live="polite"><StatusMark status={c.status} label={t(`status.${c.status}`)} /></div>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8 sm:py-8 lg:grid-cols-2">
            <section aria-labelledby="case-found">
              <h2 id="case-found" className="label mb-3">{t("case.found")}</h2>
              {working ? (
                <p className="text-[15px] text-mute" role="status">{t("case.reading")}</p>
              ) : (
                <dl className="app-scroll max-h-[300px] overflow-y-auto overscroll-contain rounded-[4px] border border-hair" tabIndex={0}>
                  {rows.map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-4 border-b border-hair px-4 py-3 last:border-b-0">
                      <dt className="note shrink-0 text-mute">{k}</dt>
                      <dd className={`min-w-0 text-right text-[15px] [overflow-wrap:anywhere] ${v ? "text-deep" : "text-mute"}`}>{v ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>

            <div className="grid content-start gap-6">
              <section aria-labelledby="case-missing">
                <h2 id="case-missing" className="label mb-3">{t("case.missing")}</h2>
                {c.status === "failed" ? (
                  <p role="alert" className="field-error">{t("case.failed")}{c.error ? ` (${c.error})` : ""}</p>
                ) : working ? (
                  <p className="text-[15px] text-mute">—</p>
                ) : c.missing.length ? (
                  <ul className="app-scroll max-h-[148px] overflow-y-auto overscroll-contain rounded-[4px] border border-hair bg-signaltint" tabIndex={0}>
                    {c.missing.map((m) => (
                      <li key={m} className="flex items-start gap-3 border-b border-hair px-4 py-3 text-[15px] text-deep last:border-b-0">
                        <span className="mt-[7px] h-[9px] w-[9px] shrink-0 rounded-full bg-signal" aria-hidden="true" />{m}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[15px] text-deep">{t("case.none")}</p>
                )}
                {canRetry && (
                  <div className="mt-4">
                    <button type="button" onClick={retry} disabled={busy} className="btn-primary">{busy ? t("case.retrying") : t("case.retry")}</button>
                    {err && <p role="alert" className="field-error mt-3">{t("case.retryFail")}</p>}
                  </div>
                )}
              </section>

              <section aria-labelledby="case-log">
                <h2 id="case-log" className="label mb-3">{t("case.log")}</h2>
                <ul className="app-scroll max-h-[148px] overflow-y-auto overscroll-contain rounded-[4px] border border-hair" tabIndex={0}>
                  {c.events.map((e, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-4 border-b border-hair px-4 py-2.5 text-[14px] text-deep last:border-b-0">
                      <span className="min-w-0 [overflow-wrap:anywhere]">{e.message}</span>
                      <time dateTime={e.at} className="num note shrink-0 text-mute" suppressHydrationWarning>
                        {new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" })}
                      </time>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
