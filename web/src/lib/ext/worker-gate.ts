// The worker and the saved Merimen login use the PR #39 gate: env, the org's consent reference, and the customer's acknowledgement.
// The Browserbase window keeps the later env-only switch in gate.ts.

import type { ExtState, OrgSetting } from "./gate";

export const workerUiOn = (env: Record<string, string | undefined> = process.env) => env.WORKER_UI === "on";

/** The saved Merimen login form is always there (owner 2026-11-27), so every "we never store your password" sentence on the
 * site must be the truthful saved-login one, whatever WORKER_UI says. Used only by the copy callers. */
export const savedLoginOn = () => true;

export function decideWorkerGate(i: { envOn: boolean; setting?: OrgSetting; consented?: boolean }): ExtState {
  if (!i.envOn) return "off";
  const ref = i.setting?.consentReference?.trim() ?? "";
  if (!i.setting?.enabled || !ref) return "off";
  if (!i.consented) return "needs_consent";
  return "ready";
}

export function missingRelation(e: unknown): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 6 && cur; i++) {
    const x = cur as { code?: string; message?: string; cause?: unknown };
    if (x.code === "42P01" || x.code === "42703") return true; // missing table / missing column (migration not applied yet)
    if (/does not exist|42P01|42703/i.test(x.message || "")) return true;
    cur = x.cause;
  }
  return false;
}
