import { requireAdmin } from "@/lib/admin/auth";
import { previewWipe, type WipeRefusal } from "@/lib/admin/wipe-user";
import { listPrefix } from "@/lib/photos/store";
import { Card, Shell, Table, int, readSp, type Sp } from "../_ui";
import { wipeAction } from "./actions";

export const dynamic = "force-dynamic";
const WHY: Record<WipeRefusal | "confirm_mismatch" | "storage_failed" | "partial", string> = {
  not_found: "No user with this email.",
  bad_email: "That is not an email address.",
  shared_org: "Someone else is in this user's company account. Nothing was touched.",
  running_job: "A job is running for this user now. Try again when it has finished. Nothing was touched.",
  confirm_mismatch: "The email you typed again did not match. Nothing was touched.",
  partial: "Something failed half-way. Part of the data may already be gone. Run the same wipe again to finish it.",
  storage_failed: "A stored file could not be removed. Nothing in the database was touched yet; run it again.",
};
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function WipePage({ searchParams }: { searchParams: Sp }) {
  await requireAdmin();
  const { scope } = await readSp(searchParams);
  const sp = await searchParams;
  const email = one(sp.email).trim();
  const err = one(sp.err) as keyof typeof WHY | "";
  const done = one(sp.done) === "1";
  const p = email ? await previewWipe(email, { listPrefix }).catch(() => null) : null;
  return (
    <Shell current="users" scope={scope} title="White out user" back={{ href: "/admin/users", label: "Users" }}>
      <div className="grid max-w-2xl gap-4">
        {done ? (
          <Card title="White-out done">
            <p className="text-[15px]">The account is now empty and still there: {int(Number(one(sp.cases)))} cases and {int(Number(one(sp.files)))} stored files erased.{Number(one(sp.left)) ? ` ${int(Number(one(sp.left)))} files uploaded while the wipe ran are still in Blob and need removing by hand.` : ""}</p>
          </Card>
        ) : null}
        {err && WHY[err] ? <p role="alert" className="rounded-[4px] border border-amber bg-ambertint p-3 text-[14px] text-fg">{WHY[err]}</p> : null}
        <Card title="Which user?" info="Empties the account: Merimen username and password, manager, adjuster, workshops, every case with its files and photos, and the saved worker session. The account itself stays: email, password, login and credit balance. This cannot be undone.">
          <form method="GET" className="flex gap-2">
            <input name="email" type="email" required defaultValue={email} placeholder="user@example.com" aria-label="User email" className="h-10 min-w-0 flex-1 rounded-[3px] border border-hair bg-panel px-3 text-[15px]" />
            <button type="submit" className="h-10 rounded-[3px] bg-ice px-4 text-[14px] font-medium text-bay">Check</button>
          </form>
        </Card>
        {email && p && !p.ok ? <p role="alert" className="text-[14px] text-mute">{WHY[p.reason]}</p> : null}
        {email && !p ? <p role="alert" className="text-[14px] text-mute">Could not check this email now. Try again.</p> : null}
        {p && p.ok ? (
          <Card title={`Will be emptied: ${p.name || p.email}`}>
            <Table rowKey={(r) => r.k} rows={rowsOf(p.counts)} empty="" cols={[{ label: "What", cell: (r) => r.k }, { label: "How many", cell: (r) => r.v, right: true }]} />
            <p className="mt-3 text-[13px] text-mute">Stays: the account and login, plus {int(p.counts.paymentOrders)} payment orders and {int(p.counts.ledgerRows)} credit ledger rows.</p>
            <form action={wipeAction} className="mt-4 grid gap-2">
              <input type="hidden" name="email" value={p.email} />
              <label className="text-[14px] font-medium" htmlFor="confirm">Type <span className="num">{p.email}</span> again to white out this account for good</label>
              <input id="confirm" name="confirm" type="email" required autoComplete="off" placeholder={p.email} className="h-10 rounded-[3px] border border-hair bg-panel px-3 text-[15px]" />
              <button type="submit" className="h-11 rounded-[3px] bg-amber px-4 text-[15px] font-semibold text-bay">White out, no undo</button>
            </form>
          </Card>
        ) : null}
      </div>
    </Shell>
  );
}

function rowsOf(c: import("@/lib/admin/wipe-user").WipeCounts) {
  return [
    { k: "Cases", v: int(c.cases) }, { k: "Uploaded documents", v: int(c.caseFiles) }, { k: "Photos", v: int(c.photos) },
    { k: "Screenshots", v: int(c.screenshots) }, { k: "Jobs", v: int(c.jobs) }, { k: "Stored files (all)", v: int(c.storedFiles) },
    { k: "Workshops", v: int(c.workshops) }, { k: "Merimen login", v: c.hasMerimenLogin ? "Yes" : "No" },
  ];
}
