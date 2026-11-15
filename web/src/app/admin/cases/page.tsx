import { requireAdmin } from "@/lib/admin/auth";
import { casesPage } from "@/lib/admin/queries";
import { IconCases, IconClock, IconErrors } from "../_icons";
import { Card, CaseId, Shell, Status, StatusBars, Table, ago, readSp, when, type Sp } from "../_ui";

export default async function Cases({ searchParams }: { searchParams: Sp }) {
  await requireAdmin();
  const { scope } = await readSp(searchParams);
  const c = await casesPage(scope);
  return (
    <Shell current="cases" scope={scope} title="Cases">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card icon={<IconCases />} title="By status"><StatusBars rows={c.byStatus} /></Card>
        <Card icon={<IconClock />} title="Stuck over 1 hour" count={c.stuck.length}>
          <Table rowKey={(r) => r.id} rows={c.stuck} empty="Nothing stuck" ok height="max-h-[300px]" cols={[
            { label: "Car", cell: (r) => <>{r.carModel ?? "–"} <CaseId id={r.id} /></> },
            { label: "Stopped at", cell: (r) => <Status s={r.status} /> },
            { label: "Started", cell: (r) => ago(r.createdAt), right: true },
          ]} />
        </Card>
      </div>
      <div className="mt-4">
        <Card icon={<IconErrors />} title="Failed" count={c.failed.length}>
          <Table rowKey={(r) => r.id} rows={c.failed} empty="No failed cases" ok height="max-h-[420px]" cols={[
            { label: "Car", cell: (r) => <>{r.carModel ?? "–"} <CaseId id={r.id} /></> },
            { label: "Why", cell: (r) => r.error ?? "–" },
            { label: "Insurer", cell: (r) => r.insurer ?? "–" },
            { label: "When", cell: (r) => when(r.createdAt), right: true },
          ]} />
        </Card>
      </div>
    </Shell>
  );
}
