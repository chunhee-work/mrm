// Marks and icons of the signed-in app. Same grid as the homepage icons: 24, stroke 1.5, square joins.
const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, "aria-hidden": true } as const;

export function Plus({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" {...line} strokeWidth={1.75}>
      <path d="M8 2.5v11M2.5 8h11" />
    </svg>
  );
}
export function Cross({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" {...line}>
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
    </svg>
  );
}
export function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 12 12" {...line}>
      <path d="M2 4.25L6 8.25l4-4" />
    </svg>
  );
}
export function Tick({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" {...line} strokeWidth={2}>
      <path d="M3 8.6l3.2 3.2L13 4.4" />
    </svg>
  );
}
export function Search({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 18 18" {...line}>
      <circle cx="7.75" cy="7.75" r="5" />
      <path d="M11.5 11.5l4.25 4.25" />
    </svg>
  );
}
export function Exit({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 18 18" {...line}>
      <path d="M7 2.75H2.75v12.5H7" />
      <path d="M7 9h8.5M12 5.5L15.5 9 12 12.5" />
    </svg>
  );
}
export function Burger({ open }: { open: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" {...line} strokeWidth={1.75}>
      {open ? <path d="M5 5l12 12M17 5L5 17" /> : <path d="M3 7h16M3 15h16" />}
    </svg>
  );
}

/** A case sheet going up: the drop zone's drawing. `lift` raises the arrow (drag-over). */
export function UploadArt({ size = 64, lift = false }: { size?: number; lift?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
      <path d="M12.5 4.5h28l11 11v44h-39z" fill="#151A21" />
      <path d="M40.5 4.5v11h11" />
      <g className="transition-transform duration-200 motion-reduce:transition-none" style={{ transform: lift ? "translateY(-4px)" : undefined }}>
        <path d="M32 49V26.5" strokeWidth="1.5" />
        <path d="M23.5 34.5L32 26l8.5 8.5" strokeWidth="1.5" />
      </g>
      <path d="M21 53.5h22" stroke="#2F3844" />
    </svg>
  );
}

/** An empty case ledger: ruled rows with nothing keyed and nothing ticked. */
export function EmptySheetArt() {
  return (
    <svg width="168" height="132" viewBox="0 0 168 132" fill="none" stroke="#BFE9FF" strokeWidth="1.25" aria-hidden="true">
      {/* crop marks */}
      <path d="M0 13.5h8M13.5 0v8M168 13.5h-8M154.500 0v8M0 118.5h8M13.5 132v-8M168 118.500h-8M154.500 132v-8" strokeWidth="1" />
      <rect x="20.5" y="20.5" width="127" height="91" rx="2" fill="#151A21" />
      <path d="M20.5 40.500h127" />
      <path d="M31 30.500h34" strokeWidth="2" />
      {[0, 1, 2].map((i) => (
        <g key={i} stroke="#2F3844">
          <path d={`M31 ${56.5 + i * 20}h82`} />
          <rect x="126.500" y={50.5 + i * 20} width="11" height="11" fill="#151A21" />
        </g>
      ))}
    </svg>
  );
}

/** Nothing under the glass. */
export function NoMatchArt() {
  return (
    <svg width="72" height="56" viewBox="0 0 72 56" fill="none" stroke="#BFE9FF" strokeWidth="1.25" aria-hidden="true">
      <path d="M2 14.500h30M2 28.500h18M2 42.500h24" stroke="#2F3844" />
      <circle cx="42" cy="25" r="14.500" fill="#151A21" />
      <path d="M52.500 35.500L68 51" strokeWidth="1.75" />
      <path d="M35 25h14" stroke="#2F3844" strokeDasharray="3 3" />
    </svg>
  );
}
