// Files dropped on the first page wait here for the new-case page (File objects cannot travel in a URL).
// The first page sends the browser to `/cases/new?dropped=1`; only that visit takes the files, so a later,
// plain "New case" never picks up another claim's files. If the trip is cut short the files stay held until
// the next drop replaces them, the next `?dropped=1` visit takes them, or the first page shows again (it lets go,
// only to free the memory).
export const DROPPED_PARAM = "dropped";
let held: File[] = [];
export const holdDropped = (files: File[]) => { held = files; };
export const takeDropped = (): File[] => { const f = held; held = []; return f; };
