import { sql, type SQL } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { internalEmails } from "./config";

// Read-only queries behind /admin. Every list is windowed (30 days by default) and paged (25 rows).
type Db = typeof defaultDb;
export const PAGE = 25;
export type Scope = { includeInternal: boolean };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rows<T = any>(db: Db, q: SQL): Promise<T[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = await db.execute(q);
  return (r.rows ?? r) as T[];
}
const num = (v: unknown) => Number(v ?? 0);

function emailList(emails: string[]) { return sql.join(emails.map((e) => sql`${e}`), sql`, `); }
/** True for the "user" table alias u: leaves out internal accounts unless included. */
export function userOk(scope: Scope, alias = "u", emails = internalEmails()): SQL {
  return scope.includeInternal ? sql`true` : sql`lower(${sql.raw(alias)}.email) NOT IN (${emailList(emails)})`;
}
/** For a user-id column on another table; rows with no user (system calls) always count. */
export function idOk(scope: Scope, col: string, emails = internalEmails()): SQL {
  const c = sql.raw(col);
  return scope.includeInternal ? sql`true` : sql`(${c} IS NULL OR ${c} NOT IN (SELECT id FROM "user" WHERE lower(email) IN (${emailList(emails)})))`;
}

export async function overview(scope: Scope, db: Db = defaultDb) {
  const [u, sign, cs, cost, em, conf] = await Promise.all([
    rows(db, sql`SELECT count(*) total, count(*) FILTER (WHERE email_verified) verified,
      count(*) FILTER (WHERE created_at > now() - interval '7 days') d7,
      count(*) FILTER (WHERE created_at > now() - interval '30 days') d30
      FROM "user" u WHERE ${userOk(scope)}`),
    rows(db, sql`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') d, count(*) n FROM "user" u
      WHERE created_at > now() - interval '30 days' AND ${userOk(scope)} GROUP BY 1`),
    rows(db, sql`SELECT c.status, count(*) n, count(*) FILTER (WHERE c.status = 'failed' AND c.created_at > now() - interval '7 days') failed7
      FROM cases c WHERE ${idOk(scope, "c.created_by")} GROUP BY c.status`),
    rows(db, sql`SELECT coalesce(sum(cost_usd) FILTER (WHERE at >= date_trunc('day', now())), 0) today,
      coalesce(sum(cost_usd) FILTER (WHERE at > now() - interval '7 days'), 0) d7,
      coalesce(sum(cost_usd) FILTER (WHERE at > now() - interval '30 days'), 0) d30,
      count(*) calls, count(*) FILTER (WHERE ok AND cost_usd IS NULL) unpriced, count(*) FILTER (WHERE NOT ok) failed
      FROM llm_calls c WHERE ${idOk(scope, "c.user_id")}`),
    rows(db, sql`SELECT count(*) FILTER (WHERE at > now() - interval '7 days' AND status = 'sent') sent7,
      count(*) FILTER (WHERE at > now() - interval '7 days' AND status = 'failed') failed7, min(at) since FROM email_log`),
    rows(db, sql`SELECT count(*) n FROM audit_log WHERE action = 'llm_calls_conflict'`),
  ]);
  const byDay = new Map(sign.map((r) => [String(r.d), num(r.n)]));
  const series: { date: string; n: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    series.push({ date: d, n: byDay.get(d) ?? 0 });
  }
  const statusCounts = Object.fromEntries(cs.map((r) => [String(r.status), num(r.n)]));
  return {
    users: { total: num(u[0]?.total), verified: num(u[0]?.verified), d7: num(u[0]?.d7), d30: num(u[0]?.d30) },
    signups: series,
    cases: { total: Object.values(statusCounts).reduce((a, b) => a + b, 0), byStatus: statusCounts, failed7: cs.reduce((a, r) => a + num(r.failed7), 0) },
    cost: { today: num(cost[0]?.today), d7: num(cost[0]?.d7), d30: num(cost[0]?.d30), calls: num(cost[0]?.calls), unpriced: num(cost[0]?.unpriced), failedCalls: num(cost[0]?.failed) },
    email: { sent7: num(em[0]?.sent7), failed7: num(em[0]?.failed7), since: em[0]?.since ? new Date(em[0].since as string).toISOString() : null },
    conflicts: num(conf[0]?.n),
  };
}

const esc = (q: string) => q.replace(/[\\%_]/g, (m) => "\\" + m);

export async function usersList(scope: Scope, q: string, page: number, db: Db = defaultDb) {
  const like = q.trim() ? `%${esc(q.trim())}%` : null;
  const where = sql`${userOk(scope)} AND (${like}::text IS NULL OR u.email ILIKE ${like} OR u.name ILIKE ${like})`;
  const [list, tot] = await Promise.all([
    rows(db, sql`SELECT u.id, u.email, u.name, u.email_verified, u.created_at,
      (SELECT max(s.updated_at) FROM session s WHERE s.user_id = u.id) last_seen,
      (SELECT count(*) FROM cases c WHERE c.created_by = u.id) cases,
      (SELECT coalesce(sum(l.cost_usd), 0) FROM llm_calls l WHERE l.user_id = u.id) cost
      FROM "user" u WHERE ${where} ORDER BY u.created_at DESC LIMIT ${PAGE} OFFSET ${Math.max(0, page) * PAGE}`),
    rows(db, sql`SELECT count(*) n FROM "user" u WHERE ${where}`),
  ]);
  return {
    total: num(tot[0]?.n),
    rows: list.map((r) => ({ id: String(r.id), email: String(r.email), name: String(r.name), verified: !!r.email_verified, createdAt: new Date(r.created_at).toISOString(),
      lastSeen: r.last_seen ? new Date(r.last_seen).toISOString() : null, cases: num(r.cases), cost: num(r.cost) })),
  };
}

export async function userDetail(id: string, db: Db = defaultDb) {
  const [u, cases, calls] = await Promise.all([
    rows(db, sql`SELECT id, email, name, email_verified, created_at FROM "user" WHERE id = ${id}`),
    rows(db, sql`SELECT c.id, c.status, c.car_model, c.insurer, c.created_at, coalesce(sum(l.cost_usd), 0) cost
      FROM cases c LEFT JOIN llm_calls l ON l.case_id = c.id WHERE c.created_by = ${id} GROUP BY c.id ORDER BY c.created_at DESC LIMIT 50`),
    rows(db, sql`SELECT at, case_id, purpose, model, input_tokens, output_tokens, cache_read_tokens, cache_write_5m_tokens, cache_write_1h_tokens, cost_usd, ok
      FROM llm_calls WHERE user_id = ${id} ORDER BY at DESC LIMIT 50`),
  ]);
  return { user: u[0] ?? null, cases, calls };
}

export async function costPage(scope: Scope, db: Db = defaultDb) {
  const ok = idOk(scope, "c.user_id");
  const [day, model, purpose, user, topCases] = await Promise.all([
    rows(db, sql`SELECT to_char(date_trunc('day', at), 'YYYY-MM-DD') d, coalesce(sum(cost_usd), 0) usd, count(*) calls FROM llm_calls c
      WHERE at > now() - interval '30 days' AND ${ok} GROUP BY 1 ORDER BY 1`),
    rows(db, sql`SELECT model, coalesce(sum(cost_usd), 0) usd, count(*) calls, sum(input_tokens) inp, sum(output_tokens) outp,
      sum(cache_read_tokens) cr, sum(cache_write_5m_tokens + cache_write_1h_tokens) cw, count(*) FILTER (WHERE ok AND cost_usd IS NULL) unpriced
      FROM llm_calls c WHERE at > now() - interval '30 days' AND ${ok} GROUP BY model ORDER BY usd DESC`),
    rows(db, sql`SELECT purpose, coalesce(sum(cost_usd), 0) usd, count(*) calls FROM llm_calls c WHERE at > now() - interval '30 days' AND ${ok} GROUP BY purpose ORDER BY usd DESC`),
    rows(db, sql`SELECT c.user_id, u.email, coalesce(sum(c.cost_usd), 0) usd, count(*) calls FROM llm_calls c LEFT JOIN "user" u ON u.id = c.user_id
      WHERE c.at > now() - interval '30 days' AND ${ok} GROUP BY c.user_id, u.email ORDER BY usd DESC LIMIT 10`),
    rows(db, sql`SELECT c.case_id, cs.status, cs.car_model, coalesce(sum(c.cost_usd), 0) usd, count(*) calls FROM llm_calls c LEFT JOIN cases cs ON cs.id = c.case_id
      WHERE c.case_id IS NOT NULL AND c.at > now() - interval '30 days' AND ${ok} GROUP BY c.case_id, cs.status, cs.car_model ORDER BY usd DESC LIMIT 10`),
  ]);
  return {
    byDay: day.map((r) => ({ date: String(r.d), usd: num(r.usd), calls: num(r.calls) })),
    byModel: model.map((r) => ({ model: String(r.model), usd: num(r.usd), calls: num(r.calls), input: num(r.inp), output: num(r.outp), cacheRead: num(r.cr), cacheWrite: num(r.cw), unpriced: num(r.unpriced) })),
    byPurpose: purpose.map((r) => ({ purpose: String(r.purpose), usd: num(r.usd), calls: num(r.calls) })),
    byUser: user.map((r) => ({ userId: r.user_id ? String(r.user_id) : null, email: r.email ? String(r.email) : null, usd: num(r.usd), calls: num(r.calls) })),
    topCases: topCases.map((r) => ({ caseId: String(r.case_id), status: r.status ? String(r.status) : null, carModel: r.car_model ? String(r.car_model) : null, usd: num(r.usd), calls: num(r.calls) })),
  };
}

export async function casesPage(scope: Scope, db: Db = defaultDb) {
  const ok = idOk(scope, "c.created_by");
  const [status, stuck, failed] = await Promise.all([
    rows(db, sql`SELECT c.status, count(*) n FROM cases c WHERE ${ok} GROUP BY c.status`),
    rows(db, sql`SELECT c.id, c.status, c.car_model, c.insurer, c.created_at FROM cases c
      WHERE c.status NOT IN ('done', 'failed', 'pending_doc') AND c.created_at < now() - interval '1 hour' AND ${ok} ORDER BY c.created_at LIMIT 50`),
    rows(db, sql`SELECT c.id, c.car_model, c.insurer, c.error, c.created_at FROM cases c WHERE c.status = 'failed' AND ${ok} ORDER BY c.created_at DESC LIMIT 50`),
  ]);
  return {
    byStatus: status.map((r) => ({ status: String(r.status), n: num(r.n) })),
    stuck: stuck.map((r) => ({ id: String(r.id), status: String(r.status), carModel: r.car_model ? String(r.car_model) : null, insurer: r.insurer ? String(r.insurer) : null, createdAt: new Date(r.created_at).toISOString() })),
    failed: failed.map((r) => ({ id: String(r.id), carModel: r.car_model ? String(r.car_model) : null, insurer: r.insurer ? String(r.insurer) : null, error: r.error ? String(r.error) : null, createdAt: new Date(r.created_at).toISOString() })),
  };
}

export async function errorsPage(scope: Scope, db: Db = defaultDb) {
  const [calls, mails, audit] = await Promise.all([
    rows(db, sql`SELECT at, purpose, model, error_class, case_id FROM llm_calls c WHERE NOT ok AND ${idOk(scope, "c.user_id")} ORDER BY at DESC LIMIT 50`),
    rows(db, sql`SELECT at, kind, recipient_domain, error_class FROM email_log WHERE status = 'failed' ORDER BY at DESC LIMIT 50`),
    rows(db, sql`SELECT at, action, detail FROM audit_log ORDER BY at DESC LIMIT 50`),
  ]);
  const iso = (v: unknown) => new Date(v as string).toISOString();
  return {
    calls: calls.map((r) => ({ at: iso(r.at), purpose: String(r.purpose), model: String(r.model), errorClass: r.error_class ? String(r.error_class) : null, caseId: r.case_id ? String(r.case_id) : null })),
    mails: mails.map((r) => ({ at: iso(r.at), kind: String(r.kind), domain: String(r.recipient_domain), errorClass: r.error_class ? String(r.error_class) : null })),
    audit: audit.map((r) => ({ at: iso(r.at), action: String(r.action), detail: r.detail ? String(r.detail) : null })),
  };
}

export async function dbReachable(db: Db = defaultDb) {
  try { await rows(db, sql`SELECT 1`); return true; } catch { return false; }
}
