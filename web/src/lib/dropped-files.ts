// Files dropped on the first page wait here for the new-case page (File objects cannot travel in a URL).
// A page change inside the app keeps this module alive; a reload empties it, which is fine.
let held: File[] = [];
export const holdDropped = (files: File[]) => { held = files; };
export const takeDropped = () => { const f = held; held = []; return f; };
