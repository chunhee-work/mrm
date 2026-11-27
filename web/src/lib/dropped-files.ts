// Files dropped on the first page wait here for the new-case page (File objects cannot travel in a URL).
// They are only handed over within a few seconds of the drop: if the trip to /cases/new is cut short, a later,
// unrelated "New case" must not pick up another claim's files.
const MAX_AGE_MS = 15_000;
let held: { files: File[]; at: number } | null = null;
export const holdDropped = (files: File[], now = Date.now()) => { held = { files, at: now }; };
export const takeDropped = (now = Date.now()): File[] => {
  const h = held;
  held = null;
  return h && now - h.at <= MAX_AGE_MS ? h.files : [];
};
