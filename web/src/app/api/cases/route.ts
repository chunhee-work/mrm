import { NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { profileBlocks } from "@/lib/ext/worker-store";
import { CaseBody, bodyProblem } from "@/lib/case-body";
import { slotToStore } from "@/lib/ext/workshops";
import { scanCase } from "@/lib/scan-case";
import { debitCase, hasCredit, refundCase } from "@/lib/payments/case-credit";

export const maxDuration = 300; // the automatic read runs after the response, inside this limit

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
  await db.insert(schema.cases).values({ id, orgId: me.orgId, createdBy: me.user.id, plate, status: "uploaded" });
  if (!(await debitCase(me.orgId, id))) { await db.delete(schema.cases).where(eq(schema.cases.id, id)); return NextResponse.json({ error: "no_credits" }, { status: 402 }); }
  try {
  if (slot) await db.insert(schema.merimenCaseWorkshop).values({ caseId: id, slot });
  await db.insert(schema.caseFiles).values(files.map((f) => ({ caseId: id, kind: f.kind, blobUrl: f.url, originalName: f.name, size: f.size })));
  await db.insert(schema.jobs).values({ caseId: id, step: "intake", state: "queued" });
  await db.insert(schema.caseEvents).values({ caseId: id, step: "upload", message: `Received ${files.length} file(s)` });
  await db.insert(schema.auditLog).values({ orgId: me.orgId, userId: me.user.id, action: "case.create", detail: id });
  } catch (e) { // the case was not created: give the credit back and remove the half-made case
    await refundCase(me.orgId, id).catch(() => {});
    await db.delete(schema.cases).where(eq(schema.cases.id, id)).catch(() => {});
    throw e;
  }
  // Step 1 starts by itself: Claude reads the documents after the response is sent.
  after(() => scanCase(id, "auto"));
  return NextResponse.json({ id });
}
