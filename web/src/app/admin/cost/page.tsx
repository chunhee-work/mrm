import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { orgSpend } from "@/lib/admin/anthropic-admin";
import { costPage } from "@/lib/admin/queries";
import { liveCost } from "@/lib/admin/live";
import { ago } from "@/lib/admin/format";
import { AutoRefresh } from "./auto-refresh";
import { PRICES, pricesStale } from "@/lib/pricing";
import { IconCases, IconChip, IconCost, IconErrors, IconUsers } from "../_icons";
import { Bars, Card, CaseId, Empty, Shell, Stat, Status, Table, Tag, int, readSp, usd, when, withScope, words, type Sp } from "../_ui";

export default async function Cost({ searchParams }: { searchParams: Sp }) {
  await requireAdmin();
  const { scope } = await readSp(searchParams);
  const [c, org, live] = await Promise.all([costPage(scope), orgSpend(), liveCost(scope)]);
  const orgDays = org.state === "ok" ? org.days : org.state === "unavailable" ? org.days ?? [] : [];
  const orgTotal = orgDays.reduce((a, d) => a + d.usd, 0);
  const total = c.byDay.reduce((a, d) => a + d.usd, 0);
  const calls = c.byDay.reduce((a, d) => a + d.calls, 0);
  const today = new Date().toISOString().slice(0, 10);
  const week = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const sum = (from: string) => c.byDay.filter((d) => d.date >= from).reduce((a, d) => a + d.usd, 0);
  const orgKeys = org.state === "ok" || org.state === "unavailable" ? org.keys ?? [] : [];
  const refreshedAt = org.state === "ok" || org.state === "unavailable" ? org.refreshedAt ?? null : null;
  const appKey = orgKeys.find((k) => k.isApp);
  // With the app's own key known, compare like with like (that key vs our count); otherwise the whole organization vs our count.
  const compareTo = appKey ? appKey.usd : orgTotal;
  const diff = compareTo - total;
  return (
    <Shell current="cost" scope={scope} title={<>Cost <span className="ml-1 font-sans text-[14px] font-normal text-mute">Last 30 days</span> <span className="ml-2 align-middle font-sans"><AutoRefresh /></span></>}>
      {pricesStale() ? (
        <details className="mb-4 rounded-[4px] border border-amber/50 bg-ambertint px-4 py-3 text-[14px]">
          <summary className="flex items-center gap-2.5 font-medium text-fg"><IconErrors className="text-amber" />AI prices have not been checked against Anthropic’s price list</summary>
          <p className="mt-2 pl-7 text-mute">{Object.entries(PRICES).map(([m, p]) => `${m}: ${p.lastVerified ? "last checked " + p.lastVerified : "never checked"}`).join("; ")}. The numbers below use these prices; a developer updates them in the price table.</p>
        </details>
      ) : null}
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<IconCost />} label="Last 5 minutes" value={usd(live.last5min.usd)} sub={`${int(live.last5min.calls)} AI calls`} />
        <Stat icon={<IconCost />} label="Last hour" value={usd(live.lastHour.usd)} sub={`${int(live.lastHour.calls)} calls`} alert={live.lastHour.failed ? `${int(live.lastHour.calls)} calls, ${int(live.lastHour.failed)} failed` : false} />
        <Stat icon={<IconChip />} label="Last AI call" value={live.lastCallAt ? ago(live.lastCallAt) : "–"} sub={live.lastCallAt ? when(live.lastCallAt) : "No calls yet"} />
        <Stat icon={<IconCost />} label={appKey ? "Anthropic today (this app's key)" : "Anthropic today"} value={org.state === "not_connected" ? "–" : usd(appKey ? appKey.today : orgDays.find((d) => d.date === today)?.usd ?? 0)} sub={refreshedAt ? `complete until ${when(refreshedAt)}` : "delayed by Anthropic"} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<IconCost />} label="Today" value={usd(sum(today))} />
        <Stat icon={<IconCost />} label="7 days" value={usd(sum(week))} />
        <Stat icon={<IconCost />} label="30 days" value={usd(total)} />
        <Stat icon={<IconChip />} label="Per AI call" value={usd(calls ? total / calls : 0)} sub={`${int(calls)} calls`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card icon={<IconCost />} title="Our count, per day" info="Counted by this app as each AI call finishes, so it is up to the minute. Days are UTC days. A call Anthropic charged for but our server never saw finish is missing here; the Anthropic bill next to it shows such a gap.">
          <Bars label="Our cost per day" data={c.byDay.map((d) => ({ date: d.date, v: d.usd }))} fmt={usd} />
        </Card>
        <Card icon={<IconCost />} title="Anthropic bill, per day" info="What Anthropic bills, per day. Anthropic publishes its numbers with a delay (usually under 4 hours, sometimes up to 24), so the newest hours are missing; the 'complete until' time says where its data ends. Our own count above is live. Keys other than this app's are anything else on the same Anthropic account.">
          {org.state === "not_connected" ? <Empty>Not connected yet</Empty> : null}
          {org.state === "unavailable" ? <p className="mb-2 text-[14px]"><Tag warn>Not available right now</Tag> <span className="text-mute">{org.staleAt ? `Showing ${when(new Date(org.staleAt).toISOString())}` : org.reason}</span></p> : null}
          {orgDays.length ? <>
            <Bars label="Anthropic cost per day" data={orgDays.map((d) => ({ date: d.date, v: d.usd }))} fmt={usd} />
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px]"><span className="num font-semibold">{usd(compareTo)}</span>
              {Math.abs(diff) < 0.01 ? <Tag>Matches our count</Tag> : <Tag warn>{diff > 0 ? `${usd(diff)} more than our count` : `${usd(-diff)} less than our count`}</Tag>}
              {appKey ? <span className="text-mute">this app’s key only (bars: whole account)</span> : <span className="text-mute">whole account</span>}</p>
            {refreshedAt ? <p className="mt-1 text-[13px] text-mute">Anthropic data complete until {when(refreshedAt)}</p> : null}
          </> : null}
        </Card>
      </div>
      {orgKeys.length ? (
        <div className="mt-4">
          <Card icon={<IconChip />} title="Anthropic bill, per API key" info="Spend per API key on the Anthropic account for the last 30 days. The row marked This app is the key the app uses (matched by the key's visible start and end only). A row with no name is spend not tied to any key.">
            <Table rowKey={(r) => r.id ?? "none"} rows={orgKeys} empty="No spend yet" height="max-h-[260px]" cols={[
              { label: "Key", cell: (r) => <>{r.name ?? r.id ?? "No key"}{r.hint ? <span className="ml-1.5 font-mono text-[12px] text-mute">{r.hint}</span> : null}{r.isApp ? <> <Tag>This app</Tag></> : null}</> },
              { label: "Today", cell: (r) => usd(r.today), right: true },
              { label: "30 days", cell: (r) => usd(r.usd), right: true },
            ]} />
          </Card>
        </div>
      ) : null}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card icon={<IconChip />} title="By task">
          <Table rowKey={(r) => r.purpose} rows={c.byPurpose} empty="No AI calls yet" height="max-h-[260px]" cols={[
            { label: "Task", cell: (r) => words(r.purpose) }, { label: "Calls", cell: (r) => int(r.calls), right: true }, { label: "Cost", cell: (r) => usd(r.usd), right: true },
          ]} />
        </Card>
        <Card icon={<IconChip />} title="By model">
          <Table rowKey={(r) => r.model} rows={c.byModel} empty="No AI calls yet" height="max-h-[260px]" cols={[
            { label: "Model", cell: (r) => <>{r.model}{r.unpriced ? <> <Tag warn>{r.unpriced} without a price</Tag></> : null}</> },
            { label: "Calls", cell: (r) => int(r.calls), right: true },
            { label: "Cost", cell: (r) => usd(r.usd), right: true },
          ]} />
        </Card>
        <Card icon={<IconCost />} title="Latest AI calls">
          <Table rowKey={(r) => r.at + r.model + (r.caseId ?? "")} rows={live.recent} empty="No AI calls yet" height="max-h-[300px]" cols={[
            { label: "When", cell: (r) => when(r.at) }, { label: "Task", cell: (r) => <>{words(r.purpose)}{r.ok ? null : <> <Tag warn>failed</Tag></>}</> },
            { label: "Cost", cell: (r) => usd(r.usd), right: true },
          ]} />
        </Card>
        <Card icon={<IconUsers />} title="Top users">
          <Table rowKey={(r) => r.userId ?? "system"} rows={c.byUser} empty="No AI calls yet" height="max-h-[300px]" cols={[
            { label: "User", cell: (r) => (r.userId ? <Link className="font-medium hover:underline" href={withScope(`/admin/users/${r.userId}`, scope)}>{r.email ?? r.userId}</Link> : "System") },
            { label: "Calls", cell: (r) => int(r.calls), right: true }, { label: "Cost", cell: (r) => usd(r.usd), right: true },
          ]} />
        </Card>
        <Card icon={<IconCases />} title="Most expensive cases">
          <Table rowKey={(r) => r.caseId} rows={c.topCases} empty="No AI calls yet" height="max-h-[300px]" cols={[
            { label: "Car", cell: (r) => <>{r.carModel ?? "–"} <CaseId id={r.caseId} /></> }, { label: "Status", cell: (r) => <Status s={r.status} /> }, { label: "Cost", cell: (r) => usd(r.usd), right: true },
          ]} />
        </Card>
      </div>
    </Shell>
  );
}
