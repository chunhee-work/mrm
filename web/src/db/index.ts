import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;
let _db: Db | null = null;
function get(): Db {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    if (/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
      // Local test database only (CI / sandbox). Production always uses Neon over HTTP.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pool } = require("pg");
      const { drizzle: pgDrizzle } = require("drizzle-orm/node-postgres");
      _db = pgDrizzle(new Pool({ connectionString: url }), { schema }) as unknown as Db;
    } else {
      _db = drizzle(neon(url), { schema });
    }
  }
  return _db;
}
// Lazy so `next build` works without secrets.
export const db = new Proxy({} as Db, { get: (_t, p) => (get() as any)[p] });
export { schema };
