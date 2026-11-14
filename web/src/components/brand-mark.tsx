import { SITE } from "@/lib/site";

/** The mark: a capital A whose crossbar is a tick. The letter is the name, the tick is the job done. */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 40L22 9q2-4 4 0l14 31" stroke="#EEF2F6" />
      <path d="M16.5 30.5l6 6L35 22" stroke="#3DDC97" />
    </svg>
  );
}

export function Brand() {
  return (
    <span className="inline-flex items-center gap-2 sm:gap-2.5">
      <BrandMark />
      <span className="display-2 text-[17px] leading-none min-[400px]:text-[19px] sm:text-[21px] text-fg max-[349px]:sr-only">{SITE.brand}</span>
    </span>
  );
}
