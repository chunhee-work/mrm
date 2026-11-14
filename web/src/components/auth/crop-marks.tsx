/** Crop marks just outside each corner of a sheet (the parent must be `relative`). */
export default function CropMarks() {
  const mark = "pointer-events-none absolute h-[11px] w-[11px] text-ink";
  const svg = (
    <svg viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1" className="block h-full w-full">
      <path d="M0 10.5h7M10.5 0v7" />
    </svg>
  );
  return (
    <span aria-hidden="true">
      <span className={`${mark} -left-[11px] -top-[11px]`}>{svg}</span>
      <span className={`${mark} -right-[11px] -top-[11px] -scale-x-100`}>{svg}</span>
      <span className={`${mark} -bottom-[11px] -left-[11px] -scale-y-100`}>{svg}</span>
      <span className={`${mark} -bottom-[11px] -right-[11px] -scale-100`}>{svg}</span>
    </span>
  );
}
