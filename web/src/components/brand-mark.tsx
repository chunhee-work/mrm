import { SITE } from "@/lib/site";

/** Registration mark: a drafting target with one amber centre. Does not depend on the letters of the name. */
export function BrandMark({ size = 26, onDark = false }: { size?: number; onDark?: boolean }) {
  const c = onDark ? "#fff" : "#1838A8";
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="8.25" stroke={c} strokeWidth="2" />
      <path d="M14 1v7M14 20v7M1 14h7M20 14h7" stroke={c} strokeWidth="2" />
      <circle cx="14" cy="14" r="3.5" fill="#FF8A1F" />
    </svg>
  );
}

export function Brand({ onDark = false }: { onDark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <BrandMark onDark={onDark} />
      <span className={`display-2 text-[19px] leading-none max-[349px]:sr-only ${onDark ? "text-white" : "text-deep"}`}>{SITE.brand}</span>
    </span>
  );
}
