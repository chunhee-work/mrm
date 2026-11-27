import { getUserOrNull } from "@/lib/session";
import { profileBlocks } from "@/lib/ext/worker-store";
import { Suspense } from "react";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { credView } from "@/lib/ext/worker-store";
import { notDeleted } from "@/lib/case-delete";
import { creditBalance } from "@/lib/payments/credit";
import AppBar from "./app/app-bar";
import SideBar from "./app/side-bar";
import NavProgress from "./app/nav-progress";
import { PageSlot } from "./lang-provider"; // R5-B03: see PageSlot

/** Signed-in pages: the working frame, on white. Wide screens: side bar + the page; phones: top bar + the page. No marketing footer. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getUserOrNull(); // the pages themselves call requireUser()
  // the side bar of a wide screen holds the user's details and the closed-case count
  const [cred, closed, credits] = me
    ? await Promise.all([
        credView(me.orgId).catch(() => null),
        db.select({ n: sql<number>`count(*)::int` }).from(schema.cases).where(and(eq(schema.cases.orgId, me.orgId), eq(schema.cases.status, "done"), notDeleted)).then((r) => Number(r[0]?.n ?? 0)).catch(() => 0),
        creditBalance(me.orgId).catch(() => null),
      ])
    : [null, 0, null];
  const email = me?.user.email ?? "";
  return (
    <div className="theme-light flex min-h-screen min-h-dvh bg-bay text-fg">
      {me && <Suspense fallback={null}><SideBar email={email} name={me.user.name ?? ""} credits={credits} cred={cred} closed={closed} /></Suspense>}
      <div className="flex min-w-0 flex-1 flex-col">
        <NavProgress />
        <AppBar email={email} newBlocked={me ? await profileBlocks(me.orgId).catch(() => false) : false} />
        <main id="main" className="flex min-h-0 flex-1 flex-col"><PageSlot>{children}</PageSlot></main>
      </div>
    </div>
  );
}
