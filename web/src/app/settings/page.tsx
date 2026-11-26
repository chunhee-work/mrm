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
  // sign-up no longer asks for a company and fills the org name from the email, so that value is not shown as one
  const fromEmail = user.email.split("@")[0].split("+")[0].trim().slice(0, 60);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const company = org?.name && !same(org.name, fromEmail) && !same(org.name, user.email) ? org.name : "";
  return <Settings email={user.email} company={company} connection={state !== "off"} />;
}
