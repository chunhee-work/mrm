// Pure rules of the photo naming desk (plan #9). No I/O here, so everything is unit-tested (test/photos.test.ts).
import NAMES_JSON from "../part-names.json";
import { PHOTO_RULES } from "../playbook/photo-rules";

/** The closed list: Merimen part names in the owner's combined spelling. */
export const PART_NAMES: readonly string[] = NAMES_JSON as string[];
const BY_LOWER = new Map(PART_NAMES.map((n) => [n.toLowerCase(), n]));
export const NONE = "__none__";
export const MAX_NAME = 120;
export const LOW_CONFIDENCE = 0.9; // below this a model name is "to confirm"
export const SLICE = 8; // photos named per Claude call
export const NEIGHBOURS = 2; // context photos on each side
export const MAX_PHOTOS = 300;
export const MAX_REGISTER = 40;
export const MAX_BYTES = 25 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const inList = (name: string) => BY_LOWER.has(name.toLowerCase());

/**
 * One canonical form for photo names and extras: trim, collapse whitespace, strip control characters, 1-120 chars.
 * A name that matches the list case-insensitively takes the list's spelling; other free text is kept as typed.
 * Returns null for empty or too long.
 */
export function canonName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!s || s.length > MAX_NAME) return null;
  return BY_LOWER.get(s.toLowerCase()) ?? s;
}

// Names a car model does not have (owner's rules, playbook 10). Data lives in playbook/photo-rules.json, shared with the worker.
const MODEL_BANS: [RegExp, RegExp][] = PHOTO_RULES.modelBans.map((b) => [new RegExp(b.vehicle, "i"), new RegExp(b.name)]);
// [vehicle must NOT match, name regex, replacement]: only Perodua has these.
const MODEL_SWAPS: [RegExp, RegExp, string][] = PHOTO_RULES.modelSwaps.map((b) => [new RegExp(b.notVehicle, "i"), new RegExp(b.name), b.to]);
const BANNED = new RegExp(PHOTO_RULES.bannedNames, "i");

function allowed(name: string, vehicle: string): string | null {
  const n = BY_LOWER.get(name.trim().toLowerCase());
  if (!n || BANNED.test(n)) return null;
  if (vehicle) {
    if (MODEL_BANS.some(([v, b]) => v.test(vehicle) && b.test(n))) return null;
    for (const [v, b, to] of MODEL_SWAPS) if (!v.test(vehicle) && b.test(n)) return to;
  }
  return n;
}

export type ModelPick = { n: number; name: string; confidence: number; alts: string[] };
export type Named = { modelName: string | null; confidence: number | null; alts: string[]; how: "rule" | "model" };

const OPENING = new Set<string>([...PHOTO_RULES.opening.corners, ...PHOTO_RULES.opening.idShots]);
const OPENING_WINDOW = PHOTO_RULES.opening.window; // the opening block sits within the first photos of a case

/** Turns one raw model answer into what is stored. Names outside the list are dropped; the next valid alt takes over. */
export function normalizePick(p: ModelPick, vehicle: string, origN: number): Named {
  const seen = new Set<string>();
  const pool: string[] = [];
  for (const raw of [p.name, ...(Array.isArray(p.alts) ? p.alts : [])]) {
    if (typeof raw !== "string" || raw === NONE) continue;
    const ok = allowed(raw, vehicle);
    if (ok && !seen.has(ok)) { seen.add(ok); pool.push(ok); }
  }
  const firstValid = typeof p.name === "string" && p.name !== NONE ? allowed(p.name, vehicle) : null;
  if (!pool.length) return { modelName: null, confidence: null, alts: [], how: "model" };
  const modelName = pool[0];
  let confidence = Math.min(1, Math.max(0, Number.isFinite(p.confidence) ? p.confidence : 0));
  if (firstValid !== modelName) confidence = Math.min(confidence, 0.3); // the pick was replaced: mark unsure
  const how = OPENING.has(modelName) && origN <= OPENING_WINDOW ? "rule" : "model";
  return { modelName, confidence, alts: pool.slice(1, 3), how };
}

/** A slice answer must cover exactly the photos that were sent. */
export function sliceMatches(sent: number[], got: ModelPick[]): boolean {
  if (got.length !== sent.length) return false;
  const a = [...sent].sort((x, y) => x - y), b = got.map((g) => g.n).sort((x, y) => x - y);
  return a.every((v, i) => v === b[i]);
}

/** A reorder must be a permutation of the case's photo ids. */
export function isPermutation(current: number[], next: unknown): next is number[] {
  if (!Array.isArray(next) || next.length !== current.length) return false;
  const want = new Set(current);
  const seen = new Set<number>();
  for (const v of next) { if (typeof v !== "number" || !want.has(v) || seen.has(v)) return false; seen.add(v); }
  return true;
}

export type DonePhoto = { nameState: string; modelName: string | null; finalName: string | null };
/** Why "done" is refused, or null when it is allowed. Photos with no shown name, or still being named, block it. */
export function doneBlock(photos: DonePhoto[]): { reason: "empty" | "naming" | "unnamed"; count: number } | null {
  if (!photos.length) return { reason: "empty", count: 0 };
  const naming = photos.filter((p) => (p.nameState === "pending" || p.nameState === "running") && !p.finalName).length;
  if (naming) return { reason: "naming", count: naming };
  const unnamed = photos.filter((p) => !p.finalName && !p.modelName).length;
  if (unnamed) return { reason: "unnamed", count: unnamed };
  return null;
}

/** Case status after "done" changes. Only the naming-desk statuses are ever touched (plan #9, section D). */
export function statusAfterDone(status: string, done: boolean): string {
  if (done) return status === "waiting_user" || status === "naming" ? "phase_b" : status;
  return status === "phase_b" ? "waiting_user" : status;
}
export const statusAfterRegister = (status: string) => (status === "uploaded" || status === "phase_a" ? "naming" : status);

/** Blob path of one upload: `<org>/<case>/photos/<id>-<f|s>-<safe name>`. */
export function photoPath(orgId: string, caseId: string, id: string, size: "f" | "s", fileName: string): string {
  const safe = fileName.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "").slice(-60) || "photo";
  return `${orgId}/${caseId}/photos/${id}-${size}-${safe}`;
}
export function pathInCase(path: unknown, orgId: string, caseId: string): path is string {
  return typeof path === "string" && path.length < 400 && path.startsWith(`${orgId}/${caseId}/photos/`) && !path.includes("..") && !path.includes("//") && !/[\u0000-\u001f\\]/.test(path);
}

// USD per 1M tokens. Only for the per-case usage ledger and the cost cap.
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};
export const PHOTO_MODELS = Object.keys(PRICES);
export const DEFAULT_PHOTO_MODEL = "claude-sonnet-5-5";
export function photoModel(env: string | undefined): string {
  return env && PHOTO_MODELS.includes(env) ? env : DEFAULT_PHOTO_MODEL;
}
export function sliceCostUsd(model: string, u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): number {
  const p = PRICES[model] ?? PRICES[DEFAULT_PHOTO_MODEL];
  return (u.input_tokens * p.input + u.output_tokens * p.output + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) / 1e6;
}
export function costCapUsd(env: string | undefined): number {
  const v = Number(env);
  return Number.isFinite(v) && v > 0 ? v : 3;
}
