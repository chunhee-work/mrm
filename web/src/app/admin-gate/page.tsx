import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { adminKey } from "@/lib/admin/key";
import { lightViewport } from "@/lib/theme";

// Not a page anyone links to: the middleware shows it at /admin (the address stays /admin) to a visitor without a key session.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const viewport: Viewport = lightViewport;

export default async function Gate({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (!adminKey()) notFound();
  const { e } = await searchParams;
  return (
    <main className="theme-light flex min-h-screen items-center justify-center bg-bay px-4 text-fg">
      <form method="POST" action="/api/admin/login" className="w-full max-w-sm rounded-[4px] border border-hair bg-panel p-6">
        <h1 className="display-3 text-[22px]">Admin</h1>
        <label htmlFor="key" className="mt-5 block text-[13px] font-medium text-mute">Secret key</label>
        <input id="key" name="key" type="password" autoComplete="off" autoFocus required spellCheck={false}
          className="mt-1.5 h-11 w-full rounded-[3px] border border-hair bg-bay px-3 text-[15px] outline-none focus:border-ice" />
        {e === "1" ? <p role="alert" className="mt-2 text-[13px] font-medium text-amber">Wrong key.</p> : null}
        {e === "2" ? <p role="alert" className="mt-2 text-[13px] font-medium text-amber">Too many tries. Wait 15 minutes.</p> : null}
        <button type="submit" className="mt-4 h-11 w-full rounded-[3px] bg-ice text-[15px] font-medium text-bay">Enter</button>
      </form>
    </main>
  );
}
