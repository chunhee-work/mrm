import { sql } from "drizzle-orm";

/**
 * How many photos of a case still wait for the adjuster: no name at all, or a model name under 90 %. One definition for the case page,
 * the dashboard and the desk. R3-B01: once 完成 was pressed (`confirmed` is true on every photo) nothing is left to check. Any edit after 完成 clears the
 * flag again (clearDone), and a photo added later starts unconfirmed, so the count comes back by itself.
 */
export const CONFIRM_COUNT = sql<number>`(count(*) filter (where not confirmed and final_name is null and ((model_name is null and name_state not in ('pending', 'running')) or (name_state = 'named' and model_name is not null and coalesce(confidence, 0) < 0.9 and coalesce(how, '') <> 'rule')))::int)`;
