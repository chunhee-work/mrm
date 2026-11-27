/**
 * The open cases of the first page while one line is open: the lines the user is looking at keep their places (`order`, the
 * ids as they stood when the line was opened), and a case that came meanwhile takes the place a fresh page would give it,
 * in front of the line that follows it in the fresh order (`fresh`). It used to drop to the very bottom until the line was closed.
 * `extra`: lines shown although they are not in the fresh list (the open line while a search hides it); they keep their place too.
 */
export function keepOrder<T extends { id: string }>(fresh: T[], order: string[], extra: T[] = []): T[] {
  const pos = new Map(order.map((id, i) => [id, i] as const));
  const all = [...fresh, ...extra.filter((x) => !fresh.some((r) => r.id === x.id))];
  const out = all.filter((r) => pos.has(r.id)).sort((a, b) => pos.get(a.id)! - pos.get(b.id)!);
  let next: string | null = null; // the line right after this one on a fresh page
  for (let i = fresh.length - 1; i >= 0; i--) {
    const r = fresh[i];
    if (!pos.has(r.id)) out.splice(next == null ? out.length : out.findIndex((x) => x.id === next), 0, r);
    next = r.id;
  }
  for (const x of extra) if (!out.some((r) => r.id === x.id)) out.push(x);
  return out;
}
