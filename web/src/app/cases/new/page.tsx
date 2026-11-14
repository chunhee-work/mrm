import { requireUser } from "@/lib/session";
import NewCaseForm from "./form";

export default async function NewCase() {
  const { orgId } = await requireUser();
  return (
    <div className="wrap flex flex-1 flex-col pb-10 pt-6 lg:justify-center lg:pb-14 lg:pt-10">
      <NewCaseForm orgId={orgId} />
    </div>
  );
}
