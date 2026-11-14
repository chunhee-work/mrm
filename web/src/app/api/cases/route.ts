import { NextResponse, after } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { getUserOrNull } from "@/lib/session";
import { scanCase } from "@/lib/scan-case";

export const maxDuration = 300; // the automatic read runs after the response, inside this limit

const Body = z.object({
  plate: z.string().trim().min(2).max(20).transform((s) => s.toUpperCase().replace(/\s+/g, "")),
  files: z.array(z.object({
    kind: z.enum(["bundle_zip", "pdf", "photo"]),
    url: z.string().url(), name: z.string().max(300), size: z.number().int().nonnegative(),
  })).min(1).max(300),
});

export async function POST(req: Request) {
  const me = await getUserOrNull();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { plate, files } = parsed.data;
  const id = crypto.randomUUID();
  await db.insert(schema.cases).values({ id, orgId: me.orgId, createdBy: me.user.id, plate, status: "uploaded" });
  await db.insert(schema.caseFiles).values(files.map((f) => ({ caseId: id, kind: f.kind, blobUrl: f.url, originalName: f.name, size: f.size })));
  await db.insert(schema.jobs).values({ caseId: id, step: "intake", state: "queued" });
  await db.insert(schema.caseEvents).values({ caseId: id, step: "upload", message: `Received ${files.length} file(s)` });
  await db.insert(schema.auditLog).values({ orgId: me.orgId, userId: me.user.id, action: "case.create", detail: id });
  // Step 1 starts by itself: Claude reads the documents after the response is sent.
  after(() => scanCase(id, { onlyIfUploaded: true }));
  return NextResponse.json({ id });
}
