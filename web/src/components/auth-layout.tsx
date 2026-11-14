import Link from "next/link";
import type { CSSProperties } from "react";
import { getT } from "@/lib/i18n-server";
import { Brand } from "./brand-mark";
import LangSwitch from "./lang-switch";
import CropMarks from "./auth/crop-marks";

// Drafting mat under the sheet: 20px squares (the sheet is 22 wide) that fade out on every side.
const fade = (deg: number) => `linear-gradient(${deg}deg, transparent, #000 34%, #000 66%, transparent)`;
const MAT: CSSProperties = {
  backgroundImage: "linear-gradient(#E3E8F2 1px, transparent 1px), linear-gradient(90deg, #E3E8F2 1px, transparent 1px)",
  backgroundSize: "20px 20px",
  WebkitMaskImage: `${fade(90)}, ${fade(180)}`,
  maskImage: `${fade(90)}, ${fade(180)}`,
  WebkitMaskComposite: "source-in",
  maskComposite: "intersect",
};

/** Account pages (log in, sign up, password reset): brand + language, one sheet, three small links. */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getT();
  const links = [
    { href: "/privacy", label: t("footer.privacy") },
    { href: "/terms", label: t("footer.terms") },
    { href: "/contact", label: t("footer.contact") },
  ];
  return (
    <div className="flex min-h-screen flex-col supports-[min-height:100dvh]:min-h-[100dvh]">
      <header className="border-b border-hair bg-paper">
        <div className="wrap flex h-[60px] items-center justify-between gap-4 lg:h-16">
          <Link href="/" className="flex h-11 items-center" aria-label={t("nav.home")}>
            <Brand />
          </Link>
          <LangSwitch />
        </div>
      </header>

      <main id="main" className="flex flex-1 flex-col overflow-clip px-4 pb-4 pt-9 sm:px-8 sm:pb-5 sm:pt-10">
        <div className="relative mx-auto w-full max-w-[440px] sm:my-auto">
          <div className="pointer-events-none absolute -inset-x-[200px] -inset-y-[120px] hidden sm:block" style={MAT} aria-hidden="true" />
          <CropMarks />
          <div className="relative rounded-[4px] border border-hair bg-white">{children}</div>
        </div>
      </main>

      <footer className="wrap">
        <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-6 pb-3 sm:pb-5">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="flex h-11 items-center text-[13px] font-medium text-mute transition-colors hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  );
}
