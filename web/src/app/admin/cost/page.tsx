import { requireAdmin } from "@/lib/admin/auth";
import { orgSpend } from "@/lib/admin/anthropic-admin";
import { costPage } from "@/lib/admin/queries";
import { PRICES, pricesStale } from "@/lib/pricing";
import { Bars, Card, Shell, Table, Tag, int, readSp, usd, when, type Sp } from "../_ui";

export default async function Cost({ searchParams }: { searchParams: Sp }) {
  await requireAdmin();
  const { scope } = await readSp(searchParams);
  const [c, org] = await Promise.all([costPage(scope), orgSpend()]);
  const ledgerByDay = new Map(c.byDay.map((d) => [d.date, d.usd]));
  const orgDays = org.state === "ok" ? org.days : org.state === "unavailable" ? org.days ?? [] : [];
  const orgTotal = orgDays.reduce((a, d) => a + d.usd, 0);
  const ledgerTotal = c.byDay.reduce((a, d) => a + d.usd, 0);
  return (
    <Shell current="cost" scope={scope}>
      {pricesStale() ? <p className="note mb-4 rounded-[4px] border border-signal bg-signaltint px-3 py-2">Check prices: {Object.entries(PRICES).map(([m, p]) => `${m} ${p.lastVerified ? "last verified " + p.lastVerified : "never verified"}`).join("; ")}. Edit PRICES in lib/pricing.ts after comparing with Anthropic’s price list.</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Our ledger, per day (USD, last 30 days)" note={`${usd(ledgerTotal)} in 30 days. A request that Anthropic billed but our server never saw (timeout after completion) is not in this ledger; the comparison on the right shows such a gap.`}>
          <Bars label="Ledger cost per day" data={c.byDay.map((d) => ({ date: d.date, v: d.usd }))} fmt={usd} />
        </Card>
        <Card title="Anthropic organization spend (USD, last 30 days)" note="Whole Anthropic organization: anything else billed to the same org is included. Fetched from the Admin API, cached per server instance for 60 s.">
          {org.state === "not_connected" ? <p className="note text-mute">Not connected. Set ANTHROPIC_ADMIN_KEY in Vercel.</p> : null}
          {org.state === "unavailable" ? <p className="note"><Tag warn>Reconciliation unavailable</Tag> {org.reason}. {org.staleAt ? `Showing the last good answer from ${when(new Date(org.staleAt).toISOString())}.` : "No earlier answer to show."}</p> : null}
          {orgDays.length ? <><Bars label="Organization cost per day" data={orgDays.map((d) => ({ date: d.date, v: d.usd }))} fmt={usd} />
            <p className="note mt-2">{usd(orgTotal)} in the window{org.state === "ok" ? ` · fetched ${when(new Date(org.fetchedAt).toISOString())}` : ""}. Difference to our ledger: {usd(orgTotal - ledgerTotal)} (information only{org.state === "ok" && org.truncated ? "; more days exist than were fetched" : ""}).</p></> : null}
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="By model, 30 days">
          <Table rowKey={(r) => r.model} rows={c.byModel} empty="No Claude calls recorded yet" height="max-h-[260px]" cols={[
            { label: "Model", cell: (r) => <>{r.model}{r.unpriced ? <> <Tag warn>{r.unpriced} unpriced</Tag></> : null}</> },
            { label: "Calls", cell: (r) => int(r.calls), right: true },
            { label: "Tokens in / out", cell: (r) => `${int(r.input)} / ${int(r.output)}`, right: true },
            { label: "Cost", cell: (r) => usd(r.usd), right: true },
          ]} />
        </Card>
        <Card title="By purpose, 30 days">
          <Table rowKey={(r) => r.purpose} rows={c.byPurpose} empty="No Claude calls recorded yet" height="max-h-[260px]" cols={[
            { label: "Purpose", cell: (r) => r.purpose }, { label: "Calls", cell: (r) => int(r.calls), right: true }, { label: "Cost", cell: (r) => usd(r.usd), right: true },
          ]} />
        </Card>
        <Card title="Top users by cost, 30 days">
          <Table rowKey={(r) => r.userId ?? "system"} rows={c.byUser} empty="No Claude calls recorded yet" height="max-h-[300px]" cols={[
            { label: "User", cell: (r) => r.email ?? "system" }, { label: "Calls", cell: (r) => int(r.calls), right: true }, { label: "Cost", cell: (r) => usd(r.usd), right: true },
          ]} />
        </Card>
        <Card title="Most expensive cases, 30 days">
          <Table rowKey={(r) => r.caseId} rows={c.topCases} empty="No Claude calls recorded yet" height="max-h-[300px]" cols={[
            { label: "Case", cell: (r) => r.caseId.slice(0, 8) }, { label: "Car", cell: (r) => r.carModel ?? "–" }, { label: "Status", cell: (r) => r.status ?? "–" }, { label: "Cost", cell: (r) => usd(r.usd), right: true },
          ]} />
        </Card>
      </div>
    </Shell>
  );
}
