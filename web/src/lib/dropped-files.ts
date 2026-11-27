// Files dropped on the first page wait here for the new-case page (File objects cannot travel in a URL).
// The first page sends the browser to `/cases/new?dropped=1`; only a visit with that marker takes the files, so a
// plain "New case" never picks up another claim's files. A hold lasts 15 s at most: a trip that took longer (stalled,
// or replaced by another click) finds nothing and says "did not arrive" instead of sending files the user gave up on.
export const DROPPED_PARAM = "dropped";
export const HOLD_MS = 15_000;
let held: File[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
export const holdDropped = (files: File[]) => {
  held = files;
  clearTimeout(timer);
  timer = setTimeout(() => { held = []; }, HOLD_MS);
};
export const takeDropped = (): File[] => { const f = held; held = []; clearTimeout(timer); return f; };
