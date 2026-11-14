"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Adds `armed` once mounted (motion allowed) and `inview` when scrolled into view.
 *  Without JS, or with reduced motion, children stay in their final state. */
export default function InView({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"" | "armed" | "armed inview">("");
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setState("armed");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) { setState("armed inview"); io.disconnect(); }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`${className} ${state}`}>{children}</div>;
}
