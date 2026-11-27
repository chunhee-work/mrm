import { getUserOrNull } from "@/lib/session";
import { profileBlocks } from "@/lib/ext/worker-store";
import AppBar from "./app/app-bar";
import NavProgress from "./app/nav-progress";
import { PageSlot } from "./lang-provider"; // R5-B03: see PageSlot

/** Signed-in pages: the working frame, on white. Top bar + the page at full viewport height, no marketing footer. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getUserOrNull(); // the pages themselves call requireUser()
  return (
    <div className="theme-light flex min-h-screen min-h-dvh flex-col bg-bay text-fg">
      <NavProgress />
      <AppBar email={me?.user.email ?? ""} newBlocked={me ? await profileBlocks(me.orgId).catch(() => false) : false} />
      <main id="main" className="flex min-h-0 flex-1 flex-col"><PageSlot>{children}</PageSlot></main>
    </div>
  );
}
