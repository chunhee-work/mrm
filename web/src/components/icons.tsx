// Line icons, one grid (24), one stroke (1.5), square joins.
const base = { width: 28, height: 28, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, "aria-hidden": true } as const;

export function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M2 8h11M9 4l4 4-4 4" />
    </svg>
  );
}
export function ArrowDown({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M8 2v11M4 9l4 4 4-4" />
    </svg>
  );
}
export function Tick({ className = "", draw = false }: { className?: string; draw?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path className={draw ? "draw" : undefined} pathLength={1} d="M3 8.6l3.2 3.2L13 4.4" />
    </svg>
  );
}

const big = { width: 40, height: 40, viewBox: "0 0 40 40", fill: "none", stroke: "currentColor", strokeWidth: 1.5, "aria-hidden": true } as const;

/** Your Merimen login stays yours — a key */
export function IconKey() {
  return (
    <svg {...big}>
      <g transform="rotate(-45 20 20)">
        <circle cx="9" cy="20" r="9.25" />
        <circle cx="9" cy="20" r="2.75" />
        <path d="M18 17.75h21.25v4.5H18M30 22.25v5.5h5v-5.5" />
      </g>
    </svg>
  );
}
/** Private by company — walled cells, one of them yours */
export function IconCells() {
  return (
    <svg {...big}>
      <path d="M3.75 3.75h13.5v13.5H3.75zM22.75 3.75h13.5v13.5h-13.5zM22.75 22.75h13.5v13.5h-13.5z" />
      <path d="M3.75 22.75h13.5v13.5H3.75z" fill="currentColor" />
    </svg>
  );
}
/** PDPA 2010 — a shield */
export function IconShield() {
  return (
    <svg {...big}>
      <path d="M20 3.25l13.5 4.5v11c0 8-5.4 14.2-13.5 17-8.1-2.8-13.5-9-13.5-17v-11z" />
      <path d="M13.75 19.75l4.5 4.5 8-9" />
    </svg>
  );
}
/** You approve first — a box only you tick */
export function IconApprove() {
  return (
    <svg {...big}>
      <path d="M33.25 20.5v12.75H6.75V6.75H24" />
      <path d="M13.5 18.5l6 6L36.5 6" />
    </svg>
  );
}
