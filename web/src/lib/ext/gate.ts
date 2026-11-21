// Plan #38, P1. One place decides whether the Merimen-connection feature may do anything for an organisation.
// One switch now: the EXT_CONNECT env value (owner decision 2026-11-16). The per-org setting and consent tables stay in the database, unused.
// With the env switch off nothing here touches the database, so production works before the migration is applied.

export type ExtState = "off" | "needs_consent" | "ready";
export type OrgSetting = { enabled: boolean; consentReference: string | null } | null | undefined;

export const envOn = (env: Record<string, string | undefined> = process.env) => env.EXT_CONNECT === "on";

/** Pure rule. Owner decision 2026-11-16: the env switch is the only gate. On = every organisation sees the window (no per-org setting, no tick box). Off = nothing. */
export function decideGate(i: { envOn: boolean; setting?: OrgSetting; consented?: boolean }): ExtState {
  return i.envOn ? "ready" : "off";
}

export async function getExtState(_orgId: string): Promise<ExtState> {
  if (!envOn()) return "off"; // no database call at all
  return decideGate({ envOn: true });
}
