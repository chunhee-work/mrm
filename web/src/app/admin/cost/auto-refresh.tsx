"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Re-reads the page's numbers every 30 s while the tab is in view, and says when they were last read. */
export function AutoRefresh({ every = 30 }: { every?: number }) {
  const router = useRouter();
  const [at, setAt] = useState<Date | null>(null);
  const [on, setOn] = useState(true);
  useEffect(() => { setAt(new Date()); }, []);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setAt(new Date());
    }, every * 1000);
    return () => clearInterval(t);
  }, [on, every, router]);
  const time = at ? at.toLocaleTimeString("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour12: false }) : "";
  return (
    <button type="button" onClick={() => setOn((v) => !v)} aria-pressed={on} className="inline-flex items-center gap-2 rounded-full border border-hair px-3 py-1 text-[13px] text-mute hover:bg-panel2">
      <span className={`h-2 w-2 rounded-full ${on ? "animate-pulse bg-go" : "bg-hair"}`} aria-hidden="true" />
      {on ? `Live · updated ${time}` : "Paused"}
    </button>
  );
}
