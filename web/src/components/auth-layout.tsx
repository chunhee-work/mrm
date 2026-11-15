import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { Brand } from "./brand-mark";
import LangSwitch from "./lang-switch";
import AuthScene from "./auth-scene";
import ScanEdge from "./scan-edge";

/** Account pages (log in, sign up, password reset), on white: brand + language, one sheet, three small links. */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getT();
  const links = [
    { href: "/privacy", label: t("footer.privacy") },
    { href: "/terms", label: t("footer.terms") },
    { href: "/contact", label: t("footer.contact") },
  ];
  return (
    <div className="theme-light relative isolate flex min-h-screen flex-col overflow-hidden bg-bay text-fg supports-[min-height:100dvh]:min-h-[100dvh]">
      <AuthScene />
      <header className="relative border-b border-hair bg-panel">
        <div className="wrap flex h-[60px] items-center justify-between gap-4 lg:h-16">
          <Link href="/" className="flex h-11 items-center" aria-label={t("nav.home")}>
            <Brand />
          </Link>
          <LangSwitch />
        </div>
      </header>

      <main id="main" className="pointer-events-none relative flex flex-1 flex-col pb-4 pt-9 sm:pb-5 sm:pt-10">
        <div className="wrap flex flex-1 flex-col lg:grid lg:grid-cols-[440px_minmax(0,1fr)] lg:items-center lg:gap-x-[clamp(40px,5vw,88px)]">
          <div className="pointer-events-auto relative mx-auto w-full max-w-[440px] sm:my-auto lg:mx-0">
            <div className="sheet relative rounded-[3px] border border-hair bg-panel">
              <ScanEdge />
              {children}
            </div>
          </div>
        </div>
      </main>

      <footer className="wrap pointer-events-none relative">
        <nav aria-label="Footer" className="pointer-events-auto mx-auto flex w-fit flex-wrap justify-center gap-x-6 pb-3 sm:pb-5">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="flex h-11 items-center text-[13px] font-medium text-mute transition-colors hover:text-ice">
              {l.label}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  );
}
