import { requireAdmin } from "@/lib/admin/auth";
import { REQUIRED_CONFIG, missingConfig } from "@/lib/admin/config";
import { dbReachable } from "@/lib/admin/queries";
import { IconDb, IconKey } from "../_icons";
import { Card, Check, Shell, readSp, type Sp } from "../_ui";

export default async function Health({ searchParams }: { searchParams: Sp }) {
  await requireAdmin();
  const { scope } = await readSp(searchParams);
  const [db, missing] = [await dbReachable(), missingConfig()];
  return (
    <Shell current="health" scope={scope} title="Health">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card icon={<IconDb />} title="Database"><Check ok={db}>{db ? "Connected" : "Cannot connect"}</Check></Card>
        <Card icon={<IconKey />} title="Settings" count={missing.length} info="Names only. Values are never shown. Missing ones are set in Vercel, under Environment Variables.">
          <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {REQUIRED_CONFIG.map((k) => {
              const ok = !missing.includes(k);
              return <li key={k} className="flex items-center gap-2"><Check ok={ok} /><span className={`min-w-0 break-all font-mono text-[13px] ${ok ? "text-mute" : "font-semibold text-fg"}`}>{k}</span></li>;
            })}
          </ul>
        </Card>
      </div>
    </Shell>
  );
}
