import { requireUser } from "@/lib/session";
import { getExtState } from "@/lib/ext/gate";
import Connection from "@/components/app/connection";

export const dynamic = "force-dynamic";

export default async function ConnectionPage() {
  const { orgId } = await requireUser();
  return <Connection state={await getExtState(orgId)} />;
}
