"use client";
import Link from "next/link";
import { useT } from "@/components/lang-provider";

/**
 * What a signed-in or account page shows when it fails to render. It sits inside that section's own frame
 * (the white page with its top bar), so the reader keeps the bar and a way back; `app/error.tsx` is only the last resort.
 */
export default function SegmentError({ reset, home }: { reset: () => void; home: "/dashboard" | "/" }) {
  const { t } = useT();
  return (
    <div className="wrap flex flex-1 flex-col justify-center py-14" role="alert">
      <h1 className="display-2 text-[30px] text-fg lg:text-[36px]">{t("err.title")}</h1>
      <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-2">
        <button type="button" onClick={reset} className="btn-primary">{t("err.retry")}</button>
        <Link href={home} className="btn-quiet">{t(home === "/" ? "nf.home" : "nav.myCases")}</Link>
      </div>
    </div>
  );
}
