import { requireAdmin } from "@/lib/admin/auth";
import { overview } from "@/lib/admin/queries";
import { Bars, Card, H, Shell, Stat, Table, int, readSp, usd, when, type Sp } from "./_ui";

export default async function Overview({ searchParams }: { searchParams: Sp }) {
  await requireAdmin();
  const { scope } = await readSp(searchParams);
  const o = await overview(scope);
  const statuses = Object.entries(o.cases.byStatus).map(([status, n]) => ({ status, n }));
  return (
    <Shell current="" scope={scope}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Users" value={int(o.users.total)} note={`${int(o.users.verified)} verified`} />
        <Stat label="Signups, last 7 days" value={int(o.users.d7)} note={`${int(o.users.d30)} in 30 days`} />
        <Stat label="Cases" value={int(o.cases.total)} note={`${int(o.cases.failed7)} failed in 7 days`} warn={o.cases.failed7 > 0} />
        <Stat label="Claude cost today (UTC)" value={usd(o.cost.today)} note={`${usd(o.cost.d7)} in 7 days · ${usd(o.cost.d30)} in 30 days`} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Signups per day, last 30 days"><Bars label="Signups per day" data={o.signups.map((s) => ({ date: s.date, v: s.n }))} /></Card>
        <Card title="Cases by status">
          <Table rowKey={(r) => r.status} rows={statuses} empty="No cases yet" cols={[{ label: "Status", cell: (r) => r.status }, { label: "Cases", cell: (r) => int(r.n), right: true }]} height="max-h-[200px]" />
        </Card>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Claude calls, all time" value={int(o.cost.calls)} note={`${int(o.cost.failedCalls)} failed`} warn={o.cost.failedCalls > 0} />
        <Stat label="Unpriced calls" value={int(o.cost.unpriced)} note="Model has no price entry" warn={o.cost.unpriced > 0} />
        <Stat label="Emails sent, 7 days" value={int(o.email.sent7)} note={`${int(o.email.failed7)} failed · counted since ${o.email.since ? when(o.email.since) : "logging started"}`} warn={o.email.failed7 > 0} />
        <Stat label="Ledger conflicts" value={int(o.conflicts)} note="Same request id, different data" warn={o.conflicts > 0} />
      </div>
      <p className="note mt-6 text-mute">Days and totals use UTC. Costs are our own ledger; the Cost page compares them with Anthropic.</p>
    </Shell>
  );
}
