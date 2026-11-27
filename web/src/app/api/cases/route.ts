import { NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { profileBlocks } from "@/lib/ext/worker-store";
import { CaseBody, bodyProblem } from "@/lib/case-body";
import { slotToStore } from "@/lib/ext/workshops";
import { scanCase } from "@/lib/scan-case";
import { debitCase, hasCredit, refundCase } from "@/lib/payments/case-credit";
import { errLine, writeTogether, type Batch } from "@/lib/db-batch";

export const maxDuration = 300; // the automatic read runs after the response, inside this limit

/**
 * Order (the same as one car of a zip split): the case and all its rows are written together, then its credit is taken.
 * A failure never costs a credit without a case, and never answers with an error while the case stays in the list:
 * - the rows cannot be written: nothing is made, nothing is charged, 500;
 * - no credit left: the case is removed again, 402;
 * - taking the credit fails halfway: the credit goes back and the case is removed, 500. When even that cannot be done the case
 *   stays (paid for, or free) and is answered as made.
 */
export async function POST(req: Request) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (await profileBlocks(me.orgId)) return NextResponse.json({ error: "profile_incomplete" }, { status: 403 }); // details not filled in on the front page
  const parsed = CaseBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const problem = bodyProblem(parsed.data, me.orgId);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const slot = await slotToStore(me.orgId, parsed.data.workshop);
  if (slot === "unknown") return NextResponse.json({ error: "workshop_unknown" }, { status: 400 });
  const { plate = "", files } = parsed.data; // "" until the documents are read (the column is NOT NULL)
  if (!(await hasCredit(me.orgId))) return NextResponse.json({ error: "no_credits" }, { status: 402 });
  const id = crypto.randomUUID();
  // Removing the case takes its files, job, event and workshop row with it. True when the case is gone.
  const remove = async () => {
    for (let k = 0; k < 2; k++) {
      const gone = await db.delete(schema.cases).where(eq(schema.cases.id, id)).then(() => true, (x) => { console.error("case create: removing the case failed", id, errLine(x)); return false; });
      if (gone) return true;
    }
    return false;
  };
  try {
    await writeTogether([
      db.insert(schema.cases).values({ id, orgId: me.orgId, createdBy: me.user.id, plate, status: "uploaded" }),
      db.insert(schema.caseFiles).values(files.map((f) => ({ caseId: id, kind: f.kind, blobUrl: f.url, originalName: f.name, size: f.size }))),
      db.insert(schema.jobs).values({ caseId: id, step: "intake", state: "queued" }),
      db.insert(schema.caseEvents).values({ caseId: id, step: "upload", message: `Received ${files.length} file(s)` }),
      db.insert(schema.auditLog).values({ orgId: me.orgId, userId: me.user.id, action: "case.create", detail: id }),
      ...(slot ? [db.insert(schema.merimenCaseWorkshop).values({ caseId: id, slot })] : []),
    ] as Batch);
  } catch (e) {
    // No credit was taken yet. A half-made case (the local database writes row by row) or one whose answer was lost is removed.
    console.error("case create: writing the case failed", id, errLine(e));
    await remove();
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  let paid: boolean;
  try {
    paid = await debitCase(me.orgId, id);
  } catch (e) {
    // The credit may or may not have been taken. Give it back if it was (a refund without a debit does nothing), then remove the case.
    console.error("case create: taking the credit failed", id, errLine(e));
    const back = await refundCase(me.orgId, id).then(() => true, () => false);
    if (back && (await remove())) return NextResponse.json({ error: "failed" }, { status: 500 });
    paid = true; // could not be undone: the case stays and is read like any other
  }
  if (!paid) {
    await remove();
    return NextResponse.json({ error: "no_credits" }, { status: 402 });
  }
  // Step 1 starts by itself: Claude reads the documents after the response is sent.
  after(() => scanCase(id, "auto"));
  return NextResponse.json({ id });
}
