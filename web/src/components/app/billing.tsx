"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { localeOf } from "@/lib/i18n";
import { useT } from "@/components/lang-provider";

export type OrderView = {
  id: string;
  createdAt: string;
  packCredits: number;
  amountMinor: number;
  currency: "MYR" | "USD";
  status: "pending" | "paid" | "failed" | "refunded" | "expired";
  testMode: boolean;
};
type PackView = { id: string; credits: number; price: Record<"MYR" | "USD", number> };
type ProviderView = { id: "lemonsqueezy" | "toyyibpay" | "mock"; currency: "MYR" | "USD"; packs: { id: string; available: boolean }[] };
type Props = {
  balance: number;
  orgName: string;
  testMode: boolean;
  providers: ProviderView[];
  packs: PackView[];
  orders: OrderView[];
  watching: { id: string; status: OrderView["status"] } | null;
};

const money = (minor: number, cur: "MYR" | "USD", lang: string) =>
  new Intl.NumberFormat(localeOf(lang as "en"), { style: "currency", currency: cur }).format(minor / 100);

export default function Billing(p: Props) {
  const { t, lang } = useT();
  const router = useRouter();
  const first = p.providers[0]?.id ?? null;
  const [provider, setProvider] = useState<string | null>(first);
  const [packId, setPackId] = useState<string>(p.packs[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // A pending order the customer just came back to: refresh until it settles (max ~2 min).
  const waiting = p.watching?.status === "pending" || p.orders.some((o) => o.status === "pending" && Date.now() - new Date(o.createdAt).getTime() < 3600_000);
  useEffect(() => {
    if (!waiting) return;
    let n = 0;
    const id = setInterval(() => { if (++n > 24) clearInterval(id); else router.refresh(); }, 5000);
    return () => clearInterval(id);
  }, [waiting, router]);

  const cur = p.providers.find((x) => x.id === provider);
  const packAvail = (id: string) => !!cur?.packs.find((k) => k.id === id)?.available;
  useEffect(() => { if (cur && !packAvail(packId)) { const k = cur.packs.find((x) => x.available); if (k) setPackId(k.id); } }, [provider]); // eslint-disable-line react-hooks/exhaustive-deps

  async function go() {
    if (!provider || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/payments/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, packId }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.url) { window.location.href = j.url; return; }
      setErr(t(j.error === "rate_limited" ? "bill.err.rate_limited" : j.error === "unavailable" ? "bill.err.unavailable" : "bill.err.generic"));
    } catch { setErr(t("bill.err.generic")); }
    setBusy(false);
  }

  const cases = p.balance / 1000;
  const Banner = (
    <>
      {p.testMode && <div role="note" className="mb-5 rounded-[3px] border border-ice bg-icetint px-4 py-3 text-[14px] font-semibold text-ice">{t("bill.test")}</div>}
      {p.watching?.status === "paid" && <div role="status" className="mb-5 rounded-[3px] border border-hair bg-panel px-4 py-3 text-[14px] font-semibold text-fg">{t("bill.thanks")}</div>}
      {p.watching?.status === "pending" && <div role="status" className="mb-5 rounded-[3px] border border-hair bg-panel px-4 py-3 text-[14px] text-fg">{t("bill.processing")}</div>}
    </>
  );

  const Balance = (
    <div className="rounded-[3px] border border-hair bg-panel p-5">
      <div className="text-[13px] font-medium text-mute">{t("bill.balance")}</div>
      <div className="mt-1 text-[40px] font-semibold leading-none tabular-nums text-fg">{p.balance.toLocaleString(localeOf(lang))}</div>
      <div className="mt-2 text-[14px] text-fg">{t("bill.cases", { n: String(Math.floor(cases * 10) / 10) })} · {t("bill.balanceHint")}</div>
      {p.orgName && <div className="mt-3 truncate text-[13px] text-mute">{t("bill.org", { org: p.orgName })}</div>}
    </div>
  );

  const ProviderPick = !p.providers.length ? (
    <div className="rounded-[3px] border border-hair bg-panel p-5"><div className="font-semibold text-fg">{t("bill.none")}</div><div className="mt-1 text-[14px] text-mute">{t("bill.noneSub")}</div></div>
  ) : (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-mute">{t("bill.pay")}</legend>
      <div className={"grid gap-2 sm:grid-cols-2"}>
        {p.providers.map((x) => (
          <label key={x.id} className={`flex min-h-[56px] cursor-pointer items-center gap-3 rounded-[3px] border px-4 py-2 ${provider === x.id ? "border-ice bg-icetint" : "border-hair bg-panel hover:border-mute"}`}>
            <input type="radio" name="provider" className="accent-ice" checked={provider === x.id} onChange={() => setProvider(x.id)} />
            <span><span className="block text-[15px] font-semibold text-fg">{t(`bill.provider.${x.id}`)}</span><span className="block text-[13px] text-mute">{t(`bill.provider.${x.id}.sub`)}</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );

  const PackPick = cur ? (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-mute">{t("bill.pick")}</legend>
      <div className={"grid gap-2 sm:grid-cols-3"}>
        {p.packs.map((k) => {
          const ok = packAvail(k.id);
          return (
            <label key={k.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-[3px] border px-4 py-3 sm:flex-col sm:items-start sm:gap-1 ${packId === k.id ? "border-ice bg-icetint" : "border-hair bg-panel hover:border-mute"} ${ok ? "" : "pointer-events-none opacity-45"}`}>
              <input type="radio" name="pack" className="sr-only" disabled={!ok} checked={packId === k.id} onChange={() => setPackId(k.id)} />
              <span className="text-[16px] font-semibold text-fg">{t(`bill.pack.${k.credits / 1000}`)}</span>
              <span className="text-[13px] text-mute">{t("bill.credits", { n: k.credits.toLocaleString(localeOf(lang)) })}</span>
              <span className="text-[18px] font-semibold tabular-nums text-fg">{money(k.price[cur.currency], cur.currency, lang)}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  ) : null;

  const Go = (
    <div>
      {err && <div role="alert" className="mb-3 text-[14px] font-semibold text-fg">⚠ {err}</div>}
      <button type="button" onClick={go} disabled={!provider || !packAvail(packId) || busy} className="btn-primary !h-12 w-full sm:w-auto sm:px-8">{busy ? t("bill.going") : t("bill.go")}</button>
    </div>
  );

  const History = (
    <section aria-labelledby="bill-hist">
      <h2 id="bill-hist" className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-mute">{t("bill.history")}</h2>
      {!p.orders.length ? <div className="rounded-[3px] border border-hair bg-panel p-5 text-[14px] text-mute">{t("bill.noHistory")}</div> : (
        <div className="max-h-[320px] overflow-auto rounded-[3px] border border-hair bg-panel">
          <table className="w-full text-left text-[14px]">
            <thead className="sticky top-0 bg-panel text-[12px] uppercase tracking-wide text-mute"><tr><th className="px-4 py-2 font-medium">{t("bill.col.date")}</th><th className="px-2 py-2 font-medium">{t("bill.col.pack")}</th><th className="px-2 py-2 text-right font-medium">{t("bill.col.amount")}</th><th className="px-4 py-2 text-right font-medium">{t("bill.col.status")}</th></tr></thead>
            <tbody>
              {p.orders.map((o) => (
                <tr key={o.id} className="border-t border-hair">
                  <td className="whitespace-nowrap px-4 py-2.5 text-fg">{new Date(o.createdAt).toLocaleDateString(localeOf(lang), { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" })}</td>
                  <td className="px-2 py-2.5">{t("bill.credits", { n: o.packCredits.toLocaleString(localeOf(lang)) })}{o.testMode ? " · TEST" : ""}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">{money(o.amountMinor, o.currency, lang)}</td>
                  <td className={`whitespace-nowrap px-4 py-2.5 text-right ${o.status === "paid" ? "font-semibold text-fg" : "text-mute"}`}>{o.status === "paid" ? "✓ " : ""}{t(`bill.s.${o.status}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  return (
    <main className="wrap py-8 lg:py-12">
      <h1 className="display-2 mb-6 text-[30px] text-fg lg:text-[36px]">{t("bill.title")}</h1>
      {Banner}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:items-start">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6"><h2 className="text-[20px] font-semibold text-fg">{t("bill.buy")}</h2>{ProviderPick}{PackPick}{Go}</div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 lg:sticky lg:top-24">{Balance}{History}</div>
      </div>
    </main>
  );
}
