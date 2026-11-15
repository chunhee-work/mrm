import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { Brand } from "./brand-mark";
import LangSwitch from "./lang-switch";
import ScanEdge from "./scan-edge";
import WhatsAppFab from "./whatsapp-fab";

/** Account pages (log in, sign up, password reset), on white: brand + language, one sheet, three small links. */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getT();
  const links = [
    { href: "/privacy", label: t("footer.privacy") },
    { href: "/terms", label: t("footer.terms") },
    { href: "/contact", label: t("footer.contact") },
  ];
  return (
    <div className="theme-light flex min-h-screen flex-col bg-bay text-fg supports-[min-height:100dvh]:min-h-[100dvh]">
      <header className="border-b border-hair bg-panel">
        <div className="wrap flex h-[60px] items-center justify-between gap-4 lg:h-16">
          <Link href="/" className="flex h-11 items-center" aria-label={t("nav.home")}>
            <Brand />
          </Link>
          <LangSwitch />
        </div>
      </header>

      <main id="main" className="flex flex-1 flex-col pb-4 pt-9 sm:pb-5 sm:pt-10">
        <div className="wrap flex flex-1 flex-col lg:grid lg:grid-cols-[440px_minmax(0,1fr)] lg:items-center lg:gap-x-[clamp(40px,5vw,88px)]">
          <div className="relative mx-auto w-full max-w-[440px] sm:my-auto lg:mx-0">
            <div className="sheet relative rounded-[3px] border border-hair bg-panel">
              <ScanEdge />
              {children}
            </div>
          </div>
          {/* wide screens: one framed picture of the bay, mid-scan (a still from the landing page's 3D scene); the page itself stays white */}
          <div className="relative hidden h-[min(600px,calc(100dvh-230px))] min-h-[420px] overflow-hidden rounded-[6px] bg-[#07090C] lg:block" aria-hidden="true">
            <img src="/landing/bay-2.jpg" alt="" className="h-full w-full object-cover object-[52%_center]" />
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
