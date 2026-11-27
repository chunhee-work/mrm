import { requireAdmin } from "@/lib/admin/auth";
import { previewWipe, type WipeRefusal } from "@/lib/admin/wipe-user";
import { listPrefix } from "@/lib/photos/store";
import { Card, Shell, Table, int, readSp, type Sp } from "../_ui";
import { wipeAction } from "./actions";

export const dynamic = "force-dynamic";
const WHY: Record<WipeRefusal | "confirm_mismatch" | "storage_failed" | "partial" | "error", string> = {
  not_found: "No user with this email. Check the spelling.",
  bad_email: "That is not an email address.",
  shared_org: "This user's company account has another member. A white-out would erase that person's data too, so it is blocked and nothing was touched. Remove the other member first, or leave this user alone.",
  running_job: "A job is running for this user right now. Try again when it has finished. Nothing was changed.",
  confirm_mismatch: "The email you typed again did not match. Nothing was touched.",
  storage_failed: "A stored file could not be deleted, so the white-out stopped. Some files may already be gone and queued jobs were cancelled; the cases and other database rows are still there. Look the email up again and run the white-out again to finish.",
  partial: "The wipe stopped part-way: some data is already gone and nothing is restored. It is safe to repeat: look the email up again and run the white-out again.",
  error: "The white-out hit an unexpected error. Look the email up again to see what is left, then run it again.",
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
            <p className="text-[15px]">The account is now empty and still there: {int(Number(one(sp.cases)))} cases and {int(Number(one(sp.files)))} stored files erased.{Number(one(sp.left)) ? ` ${int(Number(one(sp.left)))} files uploaded during the wipe were not removed. Run the white-out again to remove them.` : ""}</p>
          </Card>
        ) : null}
        {err && WHY[err] ? <p role="alert" className="rounded-[4px] border border-amber bg-ambertint p-3 text-[14px] text-fg">{WHY[err]}</p> : null}
        <Card title="Which user?" info="White out = empty the account but keep the user's sign-in. Empties: the saved Merimen username and password, manager, adjuster, workshops, every case with its files and photos, and the Merimen connection data. The account itself stays: email, password, sign-in and credit balance. This cannot be undone.">
          <form method="GET" className="flex gap-2">
            <input name="email" type="email" required defaultValue={email} placeholder="user@example.com" aria-label="User email" className="h-10 min-w-0 flex-1 rounded-[3px] border border-hair bg-panel px-3 text-[15px]" />
            <button type="submit" className="h-10 rounded-[3px] bg-ice px-4 text-[14px] font-medium text-bay">Check</button>
          </form>
        </Card>
        {email && p && !p.ok ? <p role="alert" className="rounded-[4px] border border-amber bg-ambertint p-3 text-[14px] text-fg">{WHY[p.reason]}</p> : null}
        {email && !p ? <p role="alert" className="rounded-[4px] border border-amber bg-ambertint p-3 text-[14px] text-fg">Could not check this email (database or storage did not answer). Try again in a moment.</p> : null}
        {p && p.ok ? (
          <Card title={`Will be emptied: ${p.name || p.email}`}>
            <Table rowKey={(r) => r.k} rows={rowsOf(p.counts)} empty="" cols={[{ label: "What", cell: (r) => r.k }, { label: "How many", cell: (r) => r.v, right: true }]} />
            <ul className="mt-3 grid gap-1 text-[13px] text-mute">
              <li><span className="font-medium text-fg">Also erased:</span> the saved Merimen username and password, one-time codes and extension pairing (for the Merimen connection). Queued or paused jobs are cancelled; the white-out is blocked while a job is running.</li>
              <li><span className="font-medium text-fg">Stays:</span> the user's own sign-in (email, password, verification), the company account and its membership, the Merimen consent on file, the worker connection row, the email log, the credit balance and ledger ({int(p.counts.ledgerRows)} rows), payment orders ({int(p.counts.paymentOrders)}), AI cost records (per-case usage figures go with the cases) and the audit history. Only files in this user's own storage folders are removed; a file saved anywhere else is not.</li>
              <li>Nothing is changed inside Merimen itself, only what is saved here. The user stays signed in and will see an empty account.</li>
            </ul>
            <form action={wipeAction} className="mt-4 grid gap-2">
              <input type="hidden" name="email" value={p.email} />
              <label className="text-[14px] font-medium" htmlFor="confirm">Type <span className="num">{p.email}</span> again (not case-sensitive) to white out this account</label>
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
    { k: "Screenshots", v: int(c.screenshots) }, { k: "Jobs", v: int(c.jobs) }, { k: "Stored files (total, includes the files above)", v: int(c.storedFiles) },
    { k: "Workshops", v: int(c.workshops) }, { k: "Saved Merimen username and password", v: c.hasMerimenLogin ? "Yes" : "No" },
  ];
}
