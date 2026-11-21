// Runs SQL against a real Postgres (PGlite, from web/node_modules) with every web/drizzle migration applied.
// stdin: {"seed": ["sql", ...], "steps": [{"sql": "...", "params": [...]}]}  stdout: {"results": [[row, ...], ...]}
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "../../web");
const { PGlite } = createRequire(path.join(web, "package.json"))("@electric-sql/pglite");
const db = new PGlite();
for (const f of readdirSync(path.join(web, "drizzle")).filter((f) => f.endsWith(".sql")).sort()) {
  for (const s of readFileSync(path.join(web, "drizzle", f), "utf8").split("--> statement-breakpoint")) if (s.trim()) await db.exec(s);
}
let input = "";
for await (const c of process.stdin) input += c;
const { seed = [], steps = [] } = JSON.parse(input);
for (const s of seed) await db.exec(s);
const results = [];
for (const st of steps) {
  const r = await db.query(st.sql, st.params ?? [], { rowMode: "array" });
  results.push(r.rows);
}
console.log(JSON.stringify({ results }));
