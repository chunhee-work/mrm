/**
 * Creates (or resets) the smoke-test account: a normal user with email already verified and its own empty org.
 * It only ever touches the one email below. Password comes from SMOKE_PASSWORD (never stored in the repo).
 *
 *   SMOKE_PASSWORD=… DATABASE_URL=… npx tsx scripts/seed-smoke-user.ts        # write to the database
 *   SMOKE_PASSWORD=… npx tsx scripts/seed-smoke-user.ts --sql                 # only print the SQL
 */
import { hashPassword } from "better-auth/crypto";

export const SMOKE_EMAIL = "smoke-tester@autoclaim.invalid";
const NAME = "Smoke Tester";

const password = process.env.SMOKE_PASSWORD ?? "";
if (password.length < 12) {
  console.error("Set SMOKE_PASSWORD (at least 12 characters).");
  process.exit(2);
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

async function main() {
  const hash = await hashPassword(password);
  const uid = "smoke-user";
  const oid = "smoke-org";
  const sql = [
    `INSERT INTO "user"(id,name,email,email_verified) VALUES (${q(uid)},${q(NAME)},${q(SMOKE_EMAIL)},true)
       ON CONFLICT (email) DO UPDATE SET email_verified=true, updated_at=now()`,
    `DELETE FROM account WHERE user_id=(SELECT id FROM "user" WHERE email=${q(SMOKE_EMAIL)}) AND provider_id='credential'`,
    `INSERT INTO account(id,account_id,provider_id,user_id,password)
       SELECT 'smoke-account', id, 'credential', id, ${q(hash)} FROM "user" WHERE email=${q(SMOKE_EMAIL)}`,
    `INSERT INTO organizations(id,name) VALUES (${q(oid)},${q("Smoke Tester Org")}) ON CONFLICT (id) DO NOTHING`,
    `INSERT INTO memberships(org_id,user_id,role)
       SELECT ${q(oid)}, id, 'owner' FROM "user" WHERE email=${q(SMOKE_EMAIL)}
       ON CONFLICT (org_id,user_id) DO NOTHING`,
  ];
  if (process.argv.includes("--sql")) {
    console.log(sql.map((s) => s + ";").join("\n"));
    return;
  }
  const { db } = await import("../src/db");
  const { sql: dsql } = await import("drizzle-orm");
  for (const s of sql) await db.execute(dsql.raw(s));
  console.log(`Smoke account ready: ${SMOKE_EMAIL}`);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
