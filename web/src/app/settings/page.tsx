import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { pageMeta } from "@/lib/meta";
import Settings from "./settings";
import { getExtState } from "@/lib/ext/gate";
import { workerUiOn } from "@/lib/ext/worker-gate";
import { getWorkerState } from "@/lib/ext/worker-store";

export const generateMetadata = () => pageMeta("set.title", { index: false });
export const dynamic = "force-dynamic";

// R2-U04: the one place for the account: who you are, language, password, and where the Merimen connection lives.
export default async function SettingsPage() {
  const { user, orgId } = await requireUser();
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1);
  const state = workerUiOn() ? await getWorkerState(orgId) : await getExtState(orgId);
  return <Settings email={user.email} company={org?.name ?? ""} connection={state !== "off"} />;
}
