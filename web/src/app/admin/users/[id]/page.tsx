import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { userDetail } from "@/lib/admin/queries";
import { Card, Shell, Table, Tag, int, readSp, usd, when, type Sp } from "../../_ui";

export default async function UserPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Sp }) {
  await requireAdmin();
  const { scope } = await readSp(searchParams);
  const { id } = await params;
  const d = await userDetail(id);
  if (!d.user) notFound();
  const u = d.user;
  return (
    <Shell current="users" scope={scope}>
      <div className="mb-4">
        <p className="display-3 text-[22px]">{String(u.email)}</p>
        <p className="note mt-1 text-mute">{String(u.name)} · signed up {when(new Date(u.created_at).toISOString())} · {u.email_verified ? <Tag>verified</Tag> : <Tag warn>unverified</Tag>}</p>
      </div>
      <div className="grid gap-4">
        <Card title="Cases">
          <Table rowKey={(c) => String(c.id)} rows={d.cases} empty="No cases" cols={[
            { label: "Case", cell: (c) => String(c.id).slice(0, 8) },
            { label: "Status", cell: (c) => String(c.status) },
            { label: "Car", cell: (c) => (c.car_model ? String(c.car_model) : "–") },
            { label: "Insurer", cell: (c) => (c.insurer ? String(c.insurer) : "–") },
            { label: "Created", cell: (c) => when(new Date(c.created_at).toISOString()) },
            { label: "Claude cost", cell: (c) => usd(Number(c.cost)), right: true },
          ]} />
        </Card>
        <Card title="Claude calls (latest 50)">
          <Table rowKey={(c) => String(c.at) + String(c.case_id) + String(c.cost_usd)} rows={d.calls} empty="No calls" cols={[
            { label: "When", cell: (c) => when(new Date(c.at).toISOString()) },
            { label: "Purpose", cell: (c) => String(c.purpose) },
            { label: "Model", cell: (c) => String(c.model) },
            { label: "Tokens in / out", cell: (c) => `${int(Number(c.input_tokens))} / ${int(Number(c.output_tokens))}` },
            { label: "Result", cell: (c) => (c.ok ? "ok" : <Tag warn>failed</Tag>) },
            { label: "Cost", cell: (c) => usd(c.cost_usd === null ? null : Number(c.cost_usd)), right: true },
          ]} />
        </Card>
      </div>
    </Shell>
  );
}
