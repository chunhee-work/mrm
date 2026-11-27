"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { isInternalNav } from "@/lib/nav";

// Hard test 2026-11-22: a click on a case, Billing or Settings showed nothing until the next page had arrived, so on a slow
// phone line it looked like the tap was missed. A thin bar runs along the top from the click until the new page is there.
// It only listens: no Suspense boundary, so the first load of a page is not slowed down.
export default function NavProgress() {
  const path = usePathname();
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const from = useRef(""); // the address when the click came
  useEffect(() => {
    // Next's <Link> cancels the browser's own navigation before a plain listener runs, so the click is looked at in the
    // capture phase (nothing cancelled yet). The bar only starts when the same click also reaches the window: a guard that
    // stops the click (the new-case "leave while uploading?" question, answered No) means no page is coming.
    let seen: MouseEvent | null = null;
    const look = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      // a link that opens something else in place (New case opens the file picker) brings no page
      seen = a && !a.hasAttribute("data-no-progress") && isInternalNav(e, { href: a.href, target: a.target, hasDownload: a.hasAttribute("download") }, location.href) ? e : null;
    };
    const start = (e: MouseEvent) => {
      if (e !== seen) return;
      seen = null;
      from.current = location.href;
      setOn(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setOn(false), 15000); // never stays on if a page never comes
    };
    document.addEventListener("click", look, true);
    window.addEventListener("click", start);
    return () => { document.removeEventListener("click", look, true); window.removeEventListener("click", start); };
  }, []);
  useEffect(() => { setOn(false); if (timer.current) clearTimeout(timer.current); }, [path]);
  // A link to the same page with another query (Closed cases -> Cases, or back from a search) keeps its path, so the effect
  // above never ran and the bar stayed its full 15 s. While the bar runs the address itself is watched: Next writes the new
  // address the moment the new page is shown, with or without a new path.
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => {
      if (location.href === from.current) return;
      setOn(false);
      if (timer.current) clearTimeout(timer.current);
    }, 100);
    return () => clearInterval(id);
  }, [on]);
  if (!on) return null;
  return (
    <div aria-hidden="true" data-testid="nav-progress" className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden">
      <div className="h-full w-1/3 bg-scan motion-safe:animate-[navbar_1.1s_ease-in-out_infinite] motion-reduce:w-full" />
    </div>
  );
}
