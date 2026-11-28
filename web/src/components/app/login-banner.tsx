"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/components/lang-provider";
import type { Notice } from "@/lib/ext/login-notice";

/**
 * The line at the top of every signed-in page while the Merimen login has a problem (owner 2026-11-28): why, and what to do.
 * Red = it waits on someone; amber = it fixes itself. The Cases page already shows a refused login with the form under it,
 * so there this line steps aside; on the details page (where the form is) it drops its button.
 */
export default function LoginBanner({ notice }: { notice: Notice | null }) {
  const { t } = useT();
  const path = usePathname() ?? "";
  if (!notice) return null;
  if (notice.credProblem && path.startsWith("/dashboard")) return null;
  const red = notice.tone === "red";
  const button = notice.fix && !path.startsWith("/details");
  return (
    <div className="px-4 pt-3 sm:px-6" data-testid="login-banner" data-key={notice.key}>
      <div role={red ? "alert" : "status"}
        className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[4px] border px-4 py-3 ${red ? "border-[#dc2626]/45 bg-[#fef2f2]" : "border-[#d97706]/45 bg-[#fffbeb]"}`}>
        <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[12px] font-bold leading-none text-white ${red ? "bg-[#dc2626]" : "bg-[#d97706]"}`}>!</span>
        <p className={`min-w-0 flex-1 text-[14.5px] leading-snug ${red ? "text-[#7f1d1d]" : "text-[#78350f]"}`}>
          <span className="font-semibold">{t("ln.title")}</span> {t(notice.key)}
        </p>
        {button && (
          <Link href="/details" data-testid="login-banner-fix"
            className={`inline-flex h-9 shrink-0 items-center rounded-full border bg-white px-4 text-[14px] font-semibold transition-colors ${red ? "border-[#dc2626]/60 text-[#991b1b] hover:bg-[#fee2e2]" : "border-[#d97706]/60 text-[#92400e] hover:bg-[#fef3c7]"}`}>
            {t("ln.fix")}
          </Link>
        )}
      </div>
    </div>
  );
}
