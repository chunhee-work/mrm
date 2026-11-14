import { requireAdmin } from "@/lib/admin/auth";
import { missingConfig } from "@/lib/admin/config";
import { dbReachable } from "@/lib/admin/queries";
import { Card, Shell, Tag, readSp, type Sp } from "../_ui";

export default async function Health({ searchParams }: { searchParams: Sp }) {
  await requireAdmin();
  const { scope } = await readSp(searchParams);
  const [db, missing] = [await dbReachable(), missingConfig()];
  return (
    <Shell current="health" scope={scope}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Database">{db ? <Tag>reachable</Tag> : <Tag warn>not reachable</Tag>}</Card>
        <Card title="Required settings" note="Names only. Values are never shown.">
          {missing.length ? <p><Tag warn>missing</Tag> <span className="num">{missing.join(", ")}</span></p> : <Tag>all set</Tag>}
        </Card>
      </div>
    </Shell>
  );
}
