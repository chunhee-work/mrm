import { requireAdmin } from "@/lib/admin/auth";
import { errorsPage } from "@/lib/admin/queries";
import { Card, Shell, Table, readSp, when, type Sp } from "../_ui";

export default async function Errors({ searchParams }: { searchParams: Sp }) {
  await requireAdmin();
  const { scope } = await readSp(searchParams);
  const e = await errorsPage(scope);
  return (
    <Shell current="errors" scope={scope}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Failed Claude calls">
          <Table rowKey={(r) => r.at + (r.caseId ?? "")} rows={e.calls} empty="None" height="max-h-[320px]" cols={[
            { label: "When", cell: (r) => when(r.at) }, { label: "Purpose", cell: (r) => r.purpose }, { label: "Error", cell: (r) => r.errorClass ?? "–" }, { label: "Case", cell: (r) => r.caseId?.slice(0, 8) ?? "–" },
          ]} />
        </Card>
        <Card title="Failed emails" note="Only the kind, the recipient’s domain and the error type are stored. Never the subject or the link.">
          <Table rowKey={(r) => r.at + r.domain} rows={e.mails} empty="None" height="max-h-[320px]" cols={[
            { label: "When", cell: (r) => when(r.at) }, { label: "Kind", cell: (r) => r.kind }, { label: "Domain", cell: (r) => r.domain }, { label: "Error", cell: (r) => r.errorClass ?? "–" },
          ]} />
        </Card>
      </div>
      <div className="mt-4">
        <Card title="Audit log (latest 50)">
          <Table rowKey={(r) => r.at + r.action + (r.detail ?? "")} rows={e.audit} empty="Empty" height="max-h-[320px]" cols={[
            { label: "When", cell: (r) => when(r.at) }, { label: "Action", cell: (r) => r.action }, { label: "Detail", cell: (r) => r.detail ?? "–" },
          ]} />
        </Card>
      </div>
    </Shell>
  );
}
