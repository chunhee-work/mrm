import { requireUser } from "@/lib/session";
import { credView } from "@/lib/ext/worker-store";
import { pageMeta } from "@/lib/meta";
import DetailsForm from "./details-form";

export const generateMetadata = () => pageMeta("pf.title", { index: false });
export const dynamic = "force-dynamic";

// The user's details and workshop for APC bot, typed and changed right here (owner 2026-11-27: the side bar has one link to it).
export default async function DetailsPage() {
  const { orgId } = await requireUser();
  return <DetailsForm cred={await credView(orgId)} />;
}
