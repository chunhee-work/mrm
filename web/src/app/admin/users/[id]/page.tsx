import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { userDetail } from "@/lib/admin/queries";
import { IconCases, IconChip, IconClock, IconCost } from "../../_icons";
import { Card, CaseId, Check, Shell, Stat, Status, Table, ago, int, readSp, usd, when, withScope, words, type Sp } from "../../_ui";

export default async function UserPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Sp }) {
  await requireAdmin();
  const { scope } = await readSp(searchParams);
  const { id } = await params;
  const d = await userDetail(id);
  if (!d.user) notFound();
  const u = d.user;
  return (
    <Shell current="users" scope={scope} title={String(u.name || u.email)} back={{ href: withScope("/admin/users", scope), label: "Users" }}>
      <p className="-mt-3 mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-mute">
        {String(u.email)}
        {u.email_verified ? <Check ok>Verified</Check> : <Check ok={false}>Not verified</Check>}
      </p>
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={<IconCases />} label="Cases" value={int(d.totals.cases)} />
          <Stat icon={<IconCost />} label="AI cost" value={usd(d.totals.cost)} />
          <Stat icon={<IconClock />} label="Joined" value={when(new Date(u.created_at).toISOString()).split(",")[0]} />
          <Stat icon={<IconClock />} label="Last seen" value={ago(u.last_seen ? new Date(u.last_seen).toISOString() : null)} />
        </div>
        <Card icon={<IconCases />} title="Cases">
          <Table rowKey={(c) => String(c.id)} rows={d.cases} empty="No cases yet" cols={[
            { label: "Car", cell: (c) => <>{c.car_model ? String(c.car_model) : "–"} <CaseId id={String(c.id)} /></> },
            { label: "Status", cell: (c) => <Status s={String(c.status)} /> },
            { label: "Insurer", cell: (c) => (c.insurer ? String(c.insurer) : "–") },
            { label: "Created", cell: (c) => when(new Date(c.created_at).toISOString()) },
            { label: "AI cost", cell: (c) => usd(Number(c.cost)), right: true },
          ]} />
        </Card>
        <Card icon={<IconChip />} title="AI calls">
          <Table rowKey={(c) => String(c.at) + String(c.case_id) + String(c.cost_usd)} rows={d.calls} empty="No AI calls yet" cols={[
            { label: "Task", cell: (c) => words(String(c.purpose)) },
            { label: "Result", cell: (c) => (c.ok ? <Check ok>OK</Check> : <Check ok={false}>Failed</Check>) },
            { label: "When", cell: (c) => when(new Date(c.at).toISOString()) },
            { label: "Model", cell: (c) => String(c.model) },
            { label: "Cost", cell: (c) => usd(c.cost_usd === null ? null : Number(c.cost_usd)), right: true },
          ]} />
        </Card>
        <Link href={`/admin/wipe?email=${encodeURIComponent(String(u.email))}`} className="justify-self-start text-[13px] font-medium text-mute hover:text-amber">White out this user…</Link>
      </div>
    </Shell>
  );
}
