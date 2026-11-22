import { getUserOrNull } from "@/lib/session";
import SiteNav from "./site-nav";
import SiteFooter from "./site-footer";
import WhatsAppFab from "./whatsapp-fab";
import { PageSlot } from "./lang-provider"; // R5-B03: see PageSlot

/** Public pages other than the homepage: nav + page + footer. */
export default async function SubpageLayout({ children }: { children: React.ReactNode }) {
  const me = await getUserOrNull();
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav authed={!!me} />
      <main id="main" className="flex-1"><PageSlot>{children}</PageSlot></main>
      <div className="wrap"><div className="reg-rule" /></div>
      <SiteFooter />
      <WhatsAppFab />
    </div>
  );
}
