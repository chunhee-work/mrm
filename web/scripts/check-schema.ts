// Build gate: refuses to build (so nothing deploys) when the database is behind this code. The photo desk reads columns from migration
// 0010 (cases.photos_snapshot, cases.photos_arranged_at, tables photo_upload_log, step2_log, photo_learning); `select *` on cases fails without them.
// Runs before `next build`. No DATABASE_URL (a plain local build): nothing to check. Apply migrations first: `npm run db:migrate`.
const url = process.env.DATABASE_URL;
const NEED_COLUMNS = [["cases", "photos_snapshot"], ["cases", "photos_arranged_at"]] as const;
const NEED_TABLES = ["photo_upload_log", "step2_log", "photo_learning"];

async function run(q: string): Promise<{ rows: Record<string, string>[] }> {
  if (/@(localhost|127\.0\.0\.1)[:/]/.test(url!)) {
    const { Client } = await import("pg");
    const c = new Client({ connectionString: url }); await c.connect();
    try { return await c.query(q); } finally { await c.end(); }
  }
  const { neon } = await import("@neondatabase/serverless");
  const r = await neon(url!).query(q);
  return { rows: r as unknown as Record<string, string>[] };
}

export async function missing(): Promise<string[]> {
  const cols = await run(`SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('cases','case_files')`);
  const tabs = await run(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public'`);
  const have = new Set(cols.rows.map((r) => `${r.t}.${r.c}`));
  const tables = new Set(tabs.rows.map((r) => r.t));
  return [
    ...NEED_COLUMNS.filter(([t, c]) => !have.has(`${t}.${c}`)).map(([t, c]) => `${t}.${c}`),
    ...NEED_TABLES.filter((t) => !tables.has(t)),
  ];
}

if (process.argv[1]?.endsWith("check-schema.ts")) {
  if (!url) {
    // fail closed where a deploy can happen (Vercel, CI); only a plain local build may skip
    if (process.env.VERCEL || process.env.CI) { console.error("check-schema: DATABASE_URL is not set on this build (VERCEL/CI), so the schema cannot be checked"); process.exit(1); }
    console.log("check-schema: no DATABASE_URL, skipped"); process.exit(0);
  }
  missing().then((m) => {
    if (m.length) { console.error(`check-schema: the database is missing ${m.join(", ")} (migration 0010_photo_sync.sql). Apply it, then build again.`); process.exit(1); }
    console.log("check-schema: ok");
    process.exit(0);
  }, (e) => { console.error("check-schema: could not read the schema:", e instanceof Error ? e.message : e); process.exit(1); });
}
