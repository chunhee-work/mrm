import { requireAdmin } from "@/lib/admin/auth";
import { casesPage } from "@/lib/admin/queries";
import { Card, Shell, Table, int, readSp, when, type Sp } from "../_ui";

export default async function Cases({ searchParams }: { searchParams: Sp }) {
  await requireAdmin();
  const { scope } = await readSp(searchParams);
  const c = await casesPage(scope);
  return (
    <Shell current="cases" scope={scope}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Cases by status">
          <Table rowKey={(r) => r.status} rows={c.byStatus} empty="No cases yet" height="max-h-[240px]" cols={[{ label: "Status", cell: (r) => r.status }, { label: "Cases", cell: (r) => int(r.n), right: true }]} />
        </Card>
        <Card title="Stuck: not finished after 1 hour" note="Cases not done, failed or waiting for a document.">
          <Table rowKey={(r) => r.id} rows={c.stuck} empty="None" height="max-h-[240px]" cols={[
            { label: "Case", cell: (r) => r.id.slice(0, 8) }, { label: "Status", cell: (r) => r.status }, { label: "Car", cell: (r) => r.carModel ?? "–" }, { label: "Created", cell: (r) => when(r.createdAt) },
          ]} />
        </Card>
      </div>
      <div className="mt-4">
        <Card title="Failed cases and why">
          <Table rowKey={(r) => r.id} rows={c.failed} empty="None" height="max-h-[420px]" cols={[
            { label: "Case", cell: (r) => r.id.slice(0, 8) }, { label: "Car", cell: (r) => r.carModel ?? "–" }, { label: "Insurer", cell: (r) => r.insurer ?? "–" },
            { label: "Reason", cell: (r) => r.error ?? "–" }, { label: "Created", cell: (r) => when(r.createdAt) },
          ]} />
        </Card>
      </div>
    </Shell>
  );
}
