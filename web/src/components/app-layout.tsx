import { getUserOrNull } from "@/lib/session";
import AppBar from "./app/app-bar";

/** Signed-in pages: the working frame. Top bar + the page at full viewport height, no marketing footer. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getUserOrNull(); // the pages themselves call requireUser()
  return (
    <div className="flex min-h-screen min-h-dvh flex-col">
      <AppBar email={me?.user.email ?? ""} />
      <main id="main" className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
