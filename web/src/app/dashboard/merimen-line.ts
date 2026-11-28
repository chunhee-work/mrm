/**
 * What a line of the first page shows of a case the way Merimen's case list does (owner 2026-11-29): the other car's plate
 * ([TDG1378] under the claimant's plate) and the insurer the claim goes to, which is the at-fault party's insurer, not the
 * claimant's own. Read from what Claude extracted from the documents; anything missing is null and the line leaves it out.
 */
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function merimenLine(caseData: unknown): { tpPlate: string | null; tpInsurer: string | null } {
  const d = obj(caseData);
  const af = obj(d.at_fault);
  return {
    tpPlate: str(af.plate) ?? str(obj(d.police).blamed_plate),
    tpInsurer: str(obj(af.policy).insurer),
  };
}
