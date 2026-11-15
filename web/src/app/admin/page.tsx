import { requireAdmin } from "@/lib/admin/auth";
import { missingConfig } from "@/lib/admin/config";
import { overview } from "@/lib/admin/queries";
import { IconCases, IconClock, IconCost, IconErrors, IconHealth, IconMail, IconUsers } from "./_icons";
import { Attention, Bars, Card, Shell, Stat, StatusBars, int, readSp, usd, withScope, type Sp, type Todo } from "./_ui";

export default async function Overview({ searchParams }: { searchParams: Sp }) {
  await requireAdmin();
  const { scope } = await readSp(searchParams);
  const o = await overview(scope);
  const to = (p: string) => withScope(`/admin/${p}`, scope);
  const statuses = Object.entries(o.cases.byStatus).map(([status, n]) => ({ status, n }));
  const todo: Todo[] = [
    { n: o.cases.failed7, text: "cases failed this week", href: to("cases"), icon: <IconCases /> },
    { n: o.cases.stuck, text: "cases stuck for over an hour", href: to("cases"), icon: <IconClock /> },
    { n: o.cost.failedCalls7, text: "AI calls failed this week", href: to("errors"), icon: <IconErrors /> },
    { n: o.email.failed7, text: "emails not delivered this week", href: to("errors"), icon: <IconMail /> },
    { n: o.cost.unpriced, text: "AI calls without a price", href: to("cost"), icon: <IconCost /> },
    { n: o.conflicts, text: "cost records that disagree", href: to("errors"), icon: <IconErrors /> },
    { n: missingConfig().length, text: "settings missing", href: to("health"), icon: <IconHealth /> },
  ];
  const stats = (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat icon={<IconUsers />} label="Users" value={int(o.users.total)} sub={`+${int(o.users.d7)} this week`} href={to("users")} />
      <Stat icon={<IconCases />} label="Cases" value={int(o.cases.total)} sub={`${int(o.cases.byStatus.done ?? 0)} done`} href={to("cases")} />
      <Stat icon={<IconCost />} label="AI cost today" value={usd(o.cost.today)} sub={`${usd(o.cost.d7)} this week`} href={to("cost")} />
      <Stat icon={<IconCost />} label="AI cost, 30 days" value={usd(o.cost.d30)} sub={`${int(o.cost.calls)} calls in total`} href={to("cost")} />
    </div>
  );
  const attention = <Attention items={todo} />;
  return (
    <Shell current="" scope={scope} title="Overview">
      <div className="grid gap-4">
        {stats}{attention}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card icon={<IconUsers />} title="New users, 30 days"><Bars label="Signups per day" data={o.signups.map((s) => ({ date: s.date, v: s.n }))} /></Card>
          <Card icon={<IconCases />} title="Cases by status"><StatusBars rows={statuses} /></Card>
        </div>
      </div>
    </Shell>
  );
}
