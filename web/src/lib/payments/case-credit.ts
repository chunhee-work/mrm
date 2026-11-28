import { sql } from "drizzle-orm";
import { db } from "@/db";
import { creditBalance } from "./credit";

// One credit per case. Same constraint as credit.ts: no transactions on neon-http, so every step is one statement.
// Charging is OFF unless CREDITS_ENFORCE=on (nothing changes for existing accounts until the owner decides);
// organisations in CREDITS_EXEMPT_ORGS (comma-separated ids, e.g. the smoke account's) never pay.
export const CASE_COST = 1000; // 1,000 credits = 1 case (packs.ts)

export const enforcing = () => process.env.CREDITS_ENFORCE === "on";
export const exempt = (orgId: string) => (process.env.CREDITS_EXEMPT_ORGS ?? "").split(",").map((s) => s.trim()).filter(Boolean).includes(orgId);

const rowsOf = (res: unknown): unknown[] => { const r = res as { rows?: unknown[] } | unknown[]; return Array.isArray(r) ? r : (r.rows ?? []); };

/**
 * Takes one credit for a case. Insert first, then look at the balance: if it went below zero the debit is undone in the same
 * breath (so two cases created at the same moment can never both spend the last credit) and false is returned.
 */
export async function debitCase(orgId: string, caseId: string): Promise<boolean> {
  if (!enforcing() || exempt(orgId)) return true;
  await db.execute(sql`INSERT INTO credits_ledger (org_id, delta, reason, case_id) SELECT ${orgId}, ${-CASE_COST}, ${"case:" + caseId}, ${caseId}
    WHERE NOT EXISTS (SELECT 1 FROM credits_ledger WHERE reason = ${"case:" + caseId})
    ON CONFLICT DO NOTHING`); // 0011 adds a unique index on the reason, so two racing requests cannot both debit
  if ((await creditBalance(orgId)) >= 0) return true;
  await refundCase(orgId, caseId, "nsf");
  return false;
}

/**
 * Gives the credit of a case back, once per debit (a retry that was charged again can be refunded again). The refund carries its
 * number for the case (":#n", n = refunds so far + 1); 0020's unique index lets one row per case and number in, so two refunds
 * at the same moment (a failed read and a delete) cannot both pass the count check: the second hits the index and adds nothing.
 */
export async function refundCase(orgId: string, caseId: string, why = "failed"): Promise<boolean> {
  if (!enforcing() || exempt(orgId)) return false;
  const res = await db.execute(sql`WITH n AS (SELECT count(*) AS refunds FROM credits_ledger WHERE case_id = ${caseId} AND reason LIKE 'case-refund:%')
    INSERT INTO credits_ledger (org_id, delta, reason, case_id)
    SELECT ${orgId}, ${CASE_COST}, ${"case-refund:" + why + ":" + caseId + ":#"} || (n.refunds + 1), ${caseId} FROM n
    WHERE (SELECT count(*) FROM credits_ledger WHERE case_id = ${caseId} AND delta < 0 AND (reason = ${"case:" + caseId} OR reason LIKE 'case-retry:%'))
        > n.refunds
    ON CONFLICT DO NOTHING
    RETURNING id`);
  return rowsOf(res).length > 0;
}

/**
 * A retry of a case whose credit was given back takes a credit again. "charged" / "free" (still paid for), or false (and nothing
 * taken) when the balance cannot cover it. A caller whose retry then does not run must give a "charged" credit back.
 */
export async function debitRetry(orgId: string, caseId: string): Promise<"charged" | "free" | false> {
  if (!enforcing() || exempt(orgId)) return "free";
  const res = await db.execute(sql`INSERT INTO credits_ledger (org_id, delta, reason, case_id)
    SELECT ${orgId}, ${-CASE_COST}, ${"case-retry:" + caseId + ":" + crypto.randomUUID()}, ${caseId}
    WHERE (SELECT count(*) FROM credits_ledger WHERE case_id = ${caseId} AND reason LIKE 'case-refund:%')
        >= (SELECT count(*) FROM credits_ledger WHERE case_id = ${caseId} AND delta < 0 AND (reason = ${"case:" + caseId} OR reason LIKE 'case-retry:%'))
    RETURNING id`);
  if (!rowsOf(res).length) return "free"; // the case is still paid for: a free retry
  if ((await creditBalance(orgId)) >= 0) return "charged";
  await refundCase(orgId, caseId, "nsf");
  return false;
}

/** Cheap check before any upload starts: does the organisation have a credit for one more case? */
export async function hasCredit(orgId: string): Promise<boolean> {
  if (!enforcing() || exempt(orgId)) return true;
  return (await creditBalance(orgId)) >= CASE_COST;
}
