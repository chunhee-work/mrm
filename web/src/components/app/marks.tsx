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
/** Send a file up: the mark on an upload button. */
export function Upload({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" {...line} strokeWidth={1.75}>
      <path d="M8 10.5V2.5M4.5 5.75L8 2.25l3.5 3.5M2.5 10.5v3h11v-3" />
    </svg>
  );
}
/** A photo to look at: the mark on the button that opens the naming desk. */
export function Photo({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" {...line} strokeWidth={1.75}>
      <path d="M2.5 3.5h11v9h-11zM2.5 10.5l3.25-3.25 2.5 2.5 1.75-1.75 3.5 3.5" />
      <path d="M10.5 6.25h.01" strokeWidth={2.25} strokeLinecap="square" />
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
/** Being worked on: a faint ring with one arc that goes round it (the turning is `.case-spin` in globals.css). */
export function Working({ className = "" }: { className?: string }) {
  return (
    <svg className={`case-spin ${className}`} width="16" height="16" viewBox="0 0 16 16" {...line} strokeWidth={1.75}>
      <circle cx="8" cy="8" r="6.25" opacity="0.28" />
      <path d="M8 1.75A6.25 6.25 0 0 1 14.25 8" />
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
      <path d="M12.5 4.5h28l11 11v44h-39z" className="fill-panel2" />
      <path d="M40.5 4.5v11h11" />
      <g className="transition-transform duration-200 motion-reduce:transition-none" style={{ transform: lift ? "translateY(-4px)" : undefined }}>
        <path d="M32 49V26.5" strokeWidth="1.5" />
        <path d="M23.5 34.5L32 26l8.5 8.5" strokeWidth="1.5" />
      </g>
      <path d="M21 53.5h22" className="stroke-hair2" />
    </svg>
  );
}

/** Nothing under the glass. */
export function NoMatchArt() {
  return (
    <svg width="72" height="56" viewBox="0 0 72 56" fill="none" className="stroke-ice" strokeWidth="1.25" aria-hidden="true">
      <path d="M2 14.500h30M2 28.500h18M2 42.500h24" className="stroke-hair2" />
      <circle cx="42" cy="25" r="14.500" className="fill-panel2" />
      <path d="M52.500 35.500L68 51" strokeWidth="1.75" />
      <path d="M35 25h14" className="stroke-hair2" strokeDasharray="3 3" />
    </svg>
  );
}

/** Delete a case: the bin on the list row. */
export function Bin({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" {...line}>
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.6 9.5h6.8L12 4M6.75 6.5v4.5M9.25 6.5v4.5" />
    </svg>
  );
}
