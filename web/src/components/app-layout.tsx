import { getUserOrNull } from "@/lib/session";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { sideFacts } from "@/lib/side-facts";
import AppBar, { WideNewCase } from "./app/app-bar";
import SideBar from "./app/side-bar";
import NavProgress from "./app/nav-progress";
import { PageSlot } from "./lang-provider"; // R5-B03: see PageSlot

/** Signed-in pages: the working frame, on white. Wide screens: side bar + the page; phones: top bar + the page. No marketing footer. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getUserOrNull(); // the pages themselves call requireUser()
  // the side bar of a wide screen holds the user's details and the closed-case count
  const { cred, closed, credits } = me ? await sideFacts(me.orgId) : { cred: null, closed: 0, credits: null };
  const email = me?.user.email ?? "";
  const newBlocked = cred?.blocks ?? false;
  return (
    <div className="theme-light flex min-h-screen min-h-dvh bg-bay text-fg">
      {me && <Suspense fallback={null}><SideBar email={email} name={me.user.name ?? ""} credits={credits} cred={cred} closed={closed} thin={(await cookies()).get("side")?.value === "thin"} /></Suspense>}
      <div className="flex min-w-0 flex-1 flex-col">
        <NavProgress />
        <AppBar email={email} newBlocked={newBlocked} />
        {me && <WideNewCase blocked={newBlocked} />}
        <main id="main" className="flex min-h-0 flex-1 flex-col"><PageSlot>{children}</PageSlot></main>
      </div>
    </div>
  );
}
