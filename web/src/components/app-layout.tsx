import { getUserOrNull } from "@/lib/session";
import AppBar from "./app/app-bar";
import { PageSlot } from "./lang-provider"; // R5-B03: see PageSlot

/** Signed-in pages: the working frame, on white. Top bar + the page at full viewport height, no marketing footer. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getUserOrNull(); // the pages themselves call requireUser()
  return (
    <div className="theme-light flex min-h-screen min-h-dvh flex-col bg-bay text-fg">
      <AppBar email={me?.user.email ?? ""} />
      <main id="main" className="flex min-h-0 flex-1 flex-col"><PageSlot>{children}</PageSlot></main>
    </div>
  );
}
