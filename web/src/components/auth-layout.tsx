import Link from "next/link";
import type { CSSProperties } from "react";
import { getT } from "@/lib/i18n-server";
import { Brand } from "./brand-mark";
import LangSwitch from "./lang-switch";
import ScanEdge from "./scan-edge";
import WhatsAppFab from "./whatsapp-fab";

// The pool of light the sheet stands in.
const POOL: CSSProperties = {
  backgroundImage: "radial-gradient(50% 50% at 50% 46%, rgba(191,233,255,0.11), rgba(191,233,255,0.03) 55%, transparent 72%)",
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
      <header className="border-b border-hair bg-bay">
        <div className="wrap flex h-[60px] items-center justify-between gap-4 lg:h-16">
          <Link href="/" className="flex h-11 items-center" aria-label={t("nav.home")}>
            <Brand />
          </Link>
          <LangSwitch />
        </div>
      </header>

      <main id="main" className="relative flex flex-1 flex-col overflow-clip px-4 pb-4 pt-9 sm:px-8 sm:pb-5 sm:pt-10">
        {/* wide screens: the bay itself, mid-scan, to the right of the sheet (a still from the landing page's 3D scene) */}
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[64%] lg:block" aria-hidden="true">
          <img src="/landing/bay-2.jpg" alt="" className="h-full w-full object-cover object-[88%_center]" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#07090C_0%,rgba(7,9,12,0.55)_26%,rgba(7,9,12,0)_52%),linear-gradient(0deg,#07090C_0%,rgba(7,9,12,0)_22%)]" />
        </div>
        <div className="relative mx-auto w-full max-w-[440px] sm:my-auto lg:mx-0 lg:ml-[clamp(32px,8.5vw,168px)]">
          <div className="pointer-events-none absolute -inset-x-[320px] -inset-y-[200px] hidden sm:block lg:hidden" style={POOL} aria-hidden="true" />
          <div className="relative rounded-[3px] border border-hair bg-panel">
            <ScanEdge />
            {children}
          </div>
        </div>
      </main>

      <footer className="wrap relative">
        <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-6 pb-3 sm:pb-5">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="flex h-11 items-center text-[13px] font-medium text-mute transition-colors hover:text-ice">
              {l.label}
            </Link>
          ))}
        </nav>
      </footer>
      <WhatsAppFab />
    </div>
  );
}
