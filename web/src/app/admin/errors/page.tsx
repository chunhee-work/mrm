import { requireAdmin } from "@/lib/admin/auth";
import { errorsPage } from "@/lib/admin/queries";
import { IconChip, IconClock, IconMail } from "../_icons";
import { Card, CaseId, Shell, Table, readSp, when, words, type Sp } from "../_ui";

export default async function Errors({ searchParams }: { searchParams: Sp }) {
  await requireAdmin();
  const { scope } = await readSp(searchParams);
  const e = await errorsPage(scope);
  return (
    <Shell current="errors" scope={scope} title="Errors">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card icon={<IconChip />} title="Failed AI calls" count={e.calls.length}>
          <Table rowKey={(r) => r.at + (r.caseId ?? "")} rows={e.calls} empty="No failed AI calls" ok height="max-h-[320px]" cols={[
            { label: "Task", cell: (r) => <>{words(r.purpose)} <CaseId id={r.caseId} /></> },
            { label: "Error", cell: (r) => words(r.errorClass) },
            { label: "When", cell: (r) => when(r.at), right: true },
          ]} />
        </Card>
        <Card icon={<IconMail />} title="Failed emails" count={e.mails.length} info="Only the kind of email, the recipient’s domain and the error type are stored. Never the subject or the link.">
          <Table rowKey={(r) => r.at + r.domain} rows={e.mails} empty="No failed emails" ok height="max-h-[320px]" cols={[
            { label: "Email", cell: (r) => <>{words(r.kind)} <span className="text-mute">to {r.domain}</span></> },
            { label: "Error", cell: (r) => words(r.errorClass) },
            { label: "When", cell: (r) => when(r.at), right: true },
          ]} />
        </Card>
      </div>
      <div className="mt-4">
        <Card icon={<IconClock />} title="Activity log">
          <Table rowKey={(r) => r.at + r.action + (r.detail ?? "")} rows={e.audit} empty="Nothing logged yet" height="max-h-[320px]" cols={[
            { label: "Action", cell: (r) => words(r.action) },
            { label: "Detail", cell: (r) => r.detail ?? "–" },
            { label: "When", cell: (r) => when(r.at), right: true },
          ]} />
        </Card>
      </div>
    </Shell>
  );
}
