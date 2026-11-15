// How /admin writes money, counts and times. Pure: tests can import it.
export const usd = (n: number | null) =>
  n === null ? "no price" : n === 0 ? "$0" : n < 0.005 ? "<$0.01" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const int = (n: number) => n.toLocaleString("en-US");
const TZ = "Asia/Kuala_Lumpur";
const dayTime = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const dayOnly = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
/** "14 Nov, 21:21" */
export const when = (iso: string | null) => (iso ? dayTime.format(new Date(iso)) : "–");
/** "17 Oct" from a YYYY-MM-DD bucket */
export const day = (ymd: string | undefined) => (ymd ? dayOnly.format(new Date(ymd + "T00:00:00Z")) : "");
/** "5 min ago", "3 h ago", "2 d ago"; the full time after a month */
export function ago(iso: string | null, now = Date.now()) {
  if (!iso) return "Never";
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  if (m < 60 * 24 * 30) return `${Math.round(m / 1440)} d ago`;
  return when(iso);
}
/** read_docs -> "Read docs": database codes as words */
export const words = (code: string | null | undefined) => {
  const s = (code ?? "").replace(/[_-]+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : "–";
};
