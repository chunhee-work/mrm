import { readFileSync, readdirSync } from "node:fs";

// Applies drizzle/*.sql in order. Works on Neon (HTTP) and on a local Postgres (tests).
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const files = readdirSync("./drizzle").filter((f) => f.endsWith(".sql")).sort();

async function main() {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url!);
  let run: (q: string) => Promise<any>;
  if (local) {
    const { Client } = await import("pg");
    const c = new Client({ connectionString: url }); await c.connect();
    run = (q) => c.query(q);
  } else {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url!); run = (q) => sql.query(q);
  }
  await run(`CREATE TABLE IF NOT EXISTS _migrations (name text primary key)`);
  for (const f of files) {
    const r = await run(`SELECT 1 FROM _migrations WHERE name = '${f}'`);
    if ((r.rows ?? r).length) { console.log("skip", f); continue; }
    const stmts = readFileSync(`./drizzle/${f}`, "utf8").split("--> statement-breakpoint");
    for (const s of stmts) if (s.trim()) await run(s);
    await run(`INSERT INTO _migrations VALUES ('${f}')`);
    console.log("applied", f);
  }
  process.exit(0);
}
main();
