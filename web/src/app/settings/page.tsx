import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { pageMeta } from "@/lib/meta";
import Settings from "./settings";
import { shownCompany } from "@/lib/account-name";

export const generateMetadata = () => pageMeta("set.title", { index: false });
export const dynamic = "force-dynamic";

// R2-U04: the one place for the account: who you are, language, password, and where the Merimen login is typed.
export default async function SettingsPage() {
  const { user, orgId } = await requireUser();
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1);
  return <Settings email={user.email} company={shownCompany(org?.name, user.email)} />;
}
