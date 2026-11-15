// Pure rules of the naming desk page (no React, no DOM), so they are unit-tested.
import { canonName, inList, LOW_CONFIDENCE, MAX_NAME } from "./rules";

export type Photo = {
  id: number; origN: number; position: number; srcName: string;
  state: string; how: string | null; modelName: string | null; confidence: number | null;
  alts: string[]; finalName: string | null; error: string | null; version: number;
};
export type Extra = { id: number; name: string };
export type CaseState = { caseId: string; plate: string; carModel: string | null; status: string; done: boolean; rev: number; photos: Photo[]; extras: Extra[] };
export type Filter = "all" | "confirm" | "edited";

export const shownName = (p: Photo) => p.finalName ?? p.modelName;
export const isEdited = (p: Photo) => p.finalName != null;
export const isNaming = (p: Photo) => (p.state === "pending" || p.state === "running") && !p.finalName;
export const isFixed = (p: Photo) => p.how === "rule" && !isEdited(p);
/** No name to show: a failed photo, or one the model could not name. Blocks "done" until the adjuster names it. */
export const needsName = (p: Photo) => !shownName(p) && !isNaming(p);
export const isLow = (p: Photo) => !isEdited(p) && !isFixed(p) && p.state === "named" && p.modelName != null && (p.confidence ?? 0) < LOW_CONFIDENCE;
export const toConfirm = (p: Photo) => needsName(p) || isLow(p);

export function counts(photos: Photo[]) {
  return {
    total: photos.length,
    confirm: photos.filter(toConfirm).length,
    edited: photos.filter(isEdited).length,
    naming: photos.filter(isNaming).length,
    unnamed: photos.filter(needsName).length,
    failed: photos.filter((p) => p.state === "failed").length,
  };
}
/** The cards to show. "To confirm" puts the ones without any name first. */
export function visible(photos: Photo[], f: Filter): Photo[] {
  if (f === "edited") return photos.filter(isEdited);
  if (f === "confirm") return [...photos.filter(needsName), ...photos.filter((p) => isLow(p))];
  return photos;
}
/** Other names to offer: for photos under 90 %, without a name, or edited (so the suggestion is one press away). */
export function altsOf(p: Photo): string[] {
  if (isNaming(p) || !(isEdited(p) || isLow(p) || needsName(p))) return [];
  const cur = shownName(p);
  const out: string[] = [];
  for (const n of [p.modelName, ...p.alts]) if (n && n !== cur && !out.includes(n)) out.push(n);
  return out.slice(0, 3);
}

export function moved<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

// ---- paste (plan AQ / U) ----
export type PasteAction =
  | { kind: "empty" }
  | { kind: "noop" }
  | { kind: "restore" }
  | { kind: "save"; name: string }
  | { kind: "confirm"; text: string }; // not a list name: the user has to confirm it in the name box
export function classifyPaste(raw: string | null | undefined, p: Photo): PasteAction {
  if (!raw || !raw.trim()) return { kind: "empty" };
  const multi = /[\r\n]/.test(raw.trim());
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (multi || cleaned.length > MAX_NAME || !inList(cleaned)) return { kind: "confirm", text: cleaned.slice(0, MAX_NAME) };
  const name = canonName(cleaned)!;
  if (name === shownName(p)) return { kind: "noop" };
  if (name === p.modelName) return { kind: "restore" };
  return { kind: "save", name };
}

// ---- undo: name changes only (plan K / AE) ----
export type UndoEntry = { caseId: string; photoId: number; prev: string | null; after: number; session?: string };
export class UndoStack {
  private list: UndoEntry[] = [];
  get size() { return this.list.length; }
  /** Recorded only after the server confirmed the write. Saves of one typing session collapse into one step. */
  push(e: UndoEntry) {
    const top = this.list[this.list.length - 1];
    if (e.session && top && top.session === e.session && top.photoId === e.photoId && top.caseId === e.caseId) { top.after = e.after; return; }
    this.list.push(e);
    if (this.list.length > 200) this.list.shift();
  }
  peek(): UndoEntry | undefined { return this.list[this.list.length - 1]; }
  /** The undo went through as version `newVersion`: the entry leaves, and the step before it on that photo now follows the new version. */
  done(e: UndoEntry, newVersion: number) {
    this.list = this.list.filter((x) => x !== e);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const x = this.list[i];
      if (x.caseId === e.caseId && x.photoId === e.photoId) { x.after = newVersion; break; }
    }
  }
  dropPhoto(caseId: string, photoId: number) { this.list = this.list.filter((x) => !(x.caseId === caseId && x.photoId === photoId)); }
  /**
   * After a refresh: a photo someone else changed (its version moved on) or that is gone loses its undo steps.
   * A photo with a save of our own on its way (saving) is left alone: its version is about to move because of us.
   */
  sync(caseId: string, photos: { id: number; version: number }[], saving?: (photoId: number) => boolean) {
    const ver = new Map(photos.map((p) => [p.id, p.version]));
    const newest = new Map<number, UndoEntry>();
    for (const x of this.list) if (x.caseId === caseId) newest.set(x.photoId, x);
    for (const [id, x] of newest) if (!saving?.(id) && ver.get(id) !== x.after) this.dropPhoto(caseId, id);
  }
}

// ---- upload ids (plan P / X) ----
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
type Digest = (algo: string, data: ArrayBuffer) => Promise<ArrayBuffer>;
/** SHA-256 of the original file. When hashing is not possible the file still uploads, under a random id, without a duplicate check. */
export async function fileIdentity(read: () => Promise<ArrayBuffer>, digest: Digest | null | undefined, random: () => string): Promise<{ id: string; hash: string | null }> {
  try {
    if (!digest) throw new Error("no digest");
    const h = hex(await digest("SHA-256", await read()));
    return { id: h.slice(0, 12), hash: h };
  } catch {
    return { id: `r${random().replace(/[^a-z0-9]/gi, "").slice(0, 11)}`, hash: null };
  }
}

/** A file the desk can take, or the reason it cannot. */
export function fileProblem(f: { name: string; type: string; size: number }, maxBytes: number): "heic" | "type" | "size" | null {
  if (/heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name)) return "heic";
  if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return "type";
  if (f.size > maxBytes) return "size";
  return null;
}
