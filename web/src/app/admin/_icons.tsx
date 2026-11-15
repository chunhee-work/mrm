// Admin icons. Same family as components/app/marks.tsx: an 18 grid, stroke 1.5, square joins.
import type { ReactNode } from "react";

function I({ children, className = "", size = 18 }: { children: ReactNode; className?: string; size?: number }) {
  return (
    <svg className={`shrink-0 ${className}`} width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      {children}
    </svg>
  );
}
type P = { className?: string; size?: number };

export const IconOverview = (p: P) => <I {...p}><path d="M2.75 2.75h5v6h-5zM10.25 2.75h5v3.5h-5zM10.25 8.75h5v6.5h-5zM2.75 11.25h5v4h-5z" /></I>;
export const IconUsers = (p: P) => <I {...p}><circle cx="6.75" cy="6" r="2.75" /><path d="M1.75 15.25c0-2.9 2.1-4.75 5-4.75s5 1.85 5 4.75" /><path d="M11.5 3.5a2.75 2.75 0 010 5M13.5 11c1.7.6 2.75 2.1 2.75 4.25" /></I>;
export const IconCost = (p: P) => <I {...p}><circle cx="9" cy="9" r="6.75" /><path d="M11.25 6.75c-.4-.8-1.2-1.25-2.25-1.25-1.4 0-2.25.7-2.25 1.75 0 2.5 4.75 1 4.75 3.5 0 1.05-1 1.75-2.5 1.75-1.15 0-2.05-.5-2.5-1.35M9 4v1.5M9 12.5V14" /></I>;
export const IconCases = (p: P) => <I {...p}><path d="M3.75 1.75h7.5l3 3v11.5H3.75z" /><path d="M11.25 1.75v3h3M6.5 8.25h5M6.5 11.25h5" /></I>;
export const IconErrors = (p: P) => <I {...p}><path d="M9 2.25l7 12.5H2z" /><path d="M9 7v3.75M9 12.25v.75" /></I>;
export const IconHealth = (p: P) => <I {...p}><path d="M1.5 9.5h3.25l1.75-4.5 3.25 8.5 2-5 .9 1h3.85" /></I>;
export const IconMail = (p: P) => <I {...p}><path d="M2.25 3.75h13.5v10.5H2.25z" /><path d="M2.5 4.25L9 9.75l6.5-5.5" /></I>;
export const IconClock = (p: P) => <I {...p}><circle cx="9" cy="9" r="6.75" /><path d="M9 5v4.25l2.75 1.75" /></I>;
export const IconOk = (p: P) => <I {...p}><circle cx="9" cy="9" r="6.75" /><path d="M5.75 9.25l2.25 2.25 4.25-4.75" /></I>;
export const IconNo = (p: P) => <I {...p}><circle cx="9" cy="9" r="6.75" /><path d="M6.25 6.25l5.5 5.5M11.75 6.25l-5.5 5.5" /></I>;
export const IconInfo = (p: P) => <I {...p}><circle cx="9" cy="9" r="6.75" /><path d="M9 8.25v4.25M9 5.5v.75" /></I>;
export const IconBack = (p: P) => <I {...p}><path d="M15 9H3.5M7.5 4.75L3.25 9l4.25 4.25" /></I>;
export const IconNext = (p: P) => <I {...p}><path d="M6.75 3.75L12 9l-5.25 5.25" /></I>;
export const IconPrev = (p: P) => <I {...p}><path d="M11.25 3.75L6 9l5.25 5.25" /></I>;
export const IconSearch = (p: P) => <I {...p}><circle cx="7.75" cy="7.75" r="5" /><path d="M11.5 11.5l4.25 4.25" /></I>;
export const IconExit = (p: P) => <I {...p}><path d="M7 2.75H2.75v12.5H7" /><path d="M7 9h8.5M12 5.5L15.5 9 12 12.5" /></I>;
export const IconChip = (p: P) => <I {...p}><path d="M4.75 4.75h8.5v8.5h-8.5z" /><path d="M7.25 2v2.75M10.75 2v2.75M7.25 13.25V16M10.75 13.25V16M2 7.25h2.75M2 10.75h2.75M13.25 7.25H16M13.25 10.75H16" /></I>;
export const IconDb = (p: P) => <I {...p}><ellipse cx="9" cy="4.5" rx="5.75" ry="2.25" /><path d="M3.25 4.5v9c0 1.25 2.55 2.25 5.75 2.25s5.75-1 5.75-2.25v-9M3.25 9c0 1.25 2.55 2.25 5.75 2.25S14.75 10.25 14.75 9" /></I>;
export const IconKey = (p: P) => <I {...p}><circle cx="5.75" cy="12.25" r="3" /><path d="M8 10l7.25-7.25M12 6l2.25 2.25M14.25 3.75l1.5 1.5" /></I>;
