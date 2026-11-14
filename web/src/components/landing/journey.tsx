"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { JourneyCopy } from "@/lib/landing-copy";

/**
 * The landing page's scroll journey: one pinned 3D stage, five stops.
 *   0 hero · 1 Upload · 2 Scan · 3 Autopilot · 4 Done
 * The whole picture is a pure function of one number `t` in [0, 1]; scrolling only moves `t`.
 * Each stretch between two stops takes the same scroll distance and eases in and out, so the
 * camera arrives, rests and leaves: point to point.
 *
 * With reduced motion, or when WebGL is not available, the same five frames are shown as still
 * pictures in an ordinary page (mode "still").
 */

const STOPS = [0, 0.2, 0.45, 0.7, 1] as const;
// For each block: fade in from a to b, hold, fade out from c to d (in t).
const WINDOWS: [number, number, number, number][] = [
  [-1, -1, 0.045, 0.105],
  [0.125, 0.18, 0.27, 0.325],
  [0.37, 0.43, 0.52, 0.575],
  [0.62, 0.68, 0.775, 0.83],
  [0.9, 0.96, 2, 2],
];

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => x * x * (3 - 2 * x);
function alphaAt(t: number, [a, b, c, d]: [number, number, number, number]) {
  const up = b <= a ? 1 : smooth(clamp01((t - a) / (b - a)));
  const down = d <= c ? 0 : smooth(clamp01((t - c) / (d - c)));
  return up * (1 - down);
}
/** Scroll fraction (0..1 over the section) to `t`: four equal stretches, eased. */
function tOfScroll(p: number) {
  const x = clamp01(p) * 4;
  const i = Math.min(3, Math.floor(x));
  return STOPS[i] + (STOPS[i + 1] - STOPS[i]) * smooth(x - i);
}

type Bay = { setProgress(t: number): void; render(timeMs: number): void; resize(): void; degrade(): boolean; dispose(): void };
type Mode = "boot" | "live" | "still";

export default function Journey({ c, cta, href, poster }: { c: JourneyCopy; cta: string; href: string; poster: { desktop: string[]; mobile: string[] } }) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blockRefs = useRef<(HTMLDivElement | null)[]>([]);
  const segRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const railRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("boot");

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setMode("still"); return; }
    // ?still=1: no loop and no idle motion; a script sets t and reads the frame (used to render the posters)
    const capture = new URLSearchParams(window.location.search).has("still");
    // No WebGL 2, or only a software renderer: show the stills. Asked here, quietly, so the 3D library is never loaded for nothing.
    try {
      const gl = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: !capture });
      if (!gl) { setMode("still"); return; }
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch { setMode("still"); return; }

    let bay: Bay | null = null;
    let raf = 0;
    let alive = true;
    let visible = true;
    let t = 0;
    let target = 0;
    let last = 0;
    let slow = 0;

    const paint = (tt: number) => {
      for (let i = 0; i < 5; i++) {
        const el = blockRefs.current[i];
        if (!el) continue;
        const a = alphaAt(tt, WINDOWS[i]);
        el.style.opacity = a.toFixed(3);
        el.style.visibility = a < 0.01 ? "hidden" : "visible";
        // Arrives from below, leaves upward: the same direction the page is moving.
        const before = tt < WINDOWS[i][1];
        el.style.transform = `translate3d(0, ${((1 - a) * (before ? 28 : -28)).toFixed(1)}px, 0)`;
      }
      const rail = railRef.current;
      if (rail) rail.style.opacity = (1 - alphaAt(tt, WINDOWS[0])).toFixed(3);
      for (let k = 0; k < 4; k++) {
        const seg = segRefs.current[k];
        if (seg) seg.style.transform = `scaleX(${clamp01((tt - STOPS[k]) / (STOPS[k + 1] - STOPS[k])).toFixed(3)})`;
      }
      if (hintRef.current) hintRef.current.style.opacity = (1 - clamp01(tt / 0.04)).toFixed(3);
    };

    const measure = () => {
      const r = section.getBoundingClientRect();
      const travel = r.height - window.innerHeight;
      target = tOfScroll(travel > 0 ? -r.top / travel : 0);
    };

    const frame = (now: number) => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (!visible || !bay) return;
      const raw = now - (last || now);
      const dt = Math.min(64, raw);
      last = now;
      // a device that cannot keep up gets a lighter picture, once or twice, instead of a stuttering one
      slow = raw > 42 ? slow + 1 : Math.max(0, slow - 2);
      if (slow > 24) { slow = bay.degrade() ? 0 : -1e9; }
      // critically damped follow: quick, never overshoots
      const k = 1 - Math.exp(-dt / 110);
      const next = Math.abs(target - t) < 0.0004 ? target : t + (target - t) * k;
      if (next !== t) { t = next; paint(t); bay.setProgress(t); }
      bay.render(now);
    };

    const onScroll = () => measure();
    const onResize = () => { bay?.resize(); measure(); };
    const io = new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); if (visible) last = 0; }, { rootMargin: "120px" });

    (async () => {
      try {
        const { createBay } = await import("./bay");
        if (!alive) return;
        bay = createBay(canvas, { mobile: window.matchMedia("(max-width: 767px)").matches });
        measure();
        t = target;
        bay.setProgress(t);
        bay.render(performance.now());
        paint(t);
        setMode("live");
        if (capture) {
          const w = window as unknown as { __setT?: (v: number) => void; __bayReady?: boolean };
          w.__setT = (v: number) => { t = target = v; paint(v); bay!.setProgress(v); bay!.render(0); };
          w.__bayReady = true;
          return;
        }
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onResize);
        io.observe(section);
        raf = requestAnimationFrame(frame);
      } catch {
        if (alive) setMode("still");
      }
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      bay?.dispose();
    };
  }, []);

  const still = mode === "still";
  const words = [null, ...c.steps];

  if (still) {
    // Five ordinary screens, one still frame each.
    return (
      <section aria-label={c.h1.join(" ")}>
        {words.map((s, i) => (
          <div key={i} className="relative flex min-h-[100svh] flex-col justify-start overflow-hidden pt-[112px] md:justify-center md:pt-0">
            <picture>
              <source media="(max-width: 767px)" srcSet={poster.mobile[i]} />
              <img src={poster.desktop[i]} alt="" className="absolute inset-0 h-full w-full object-cover" loading={i ? "lazy" : "eager"} />
            </picture>
            <div className="wrap relative">
              {s ? <StepText word={s.word} line={s.line} last={i === 4} cta={cta} href={href} /> : <HeroText c={c} cta={cta} href={href} />}
            </div>
          </div>
        ))}
      </section>
    );
  }

  return (
    <section ref={sectionRef} aria-label={c.h1.join(" ")} className="relative h-[600svh]">
      <a href="#after-journey" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-20 focus:z-50 focus:rounded-[3px] focus:bg-ice focus:px-4 focus:py-3 focus:text-[15px] focus:font-semibold focus:text-bay">
        {c.skip}
      </a>
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        {/* the first frame as a picture, so the hero is there before the 3D has loaded */}
        <picture>
          <source media="(max-width: 767px)" srcSet={poster.mobile[0]} />
          <img src={poster.desktop[0]} alt="" fetchPriority="high" className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${mode === "live" ? "opacity-0" : "opacity-100"}`} />
        </picture>
        <canvas ref={canvasRef} aria-hidden="true" className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${mode === "live" ? "opacity-100" : "opacity-0"}`} />

        {/* a shadow the words stand in: left on wide screens, top on phones */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,9,12,0.92)_0%,rgba(7,9,12,0.6)_30%,rgba(7,9,12,0)_52%)] md:bg-[linear-gradient(90deg,rgba(7,9,12,0.9)_0%,rgba(7,9,12,0.62)_30%,rgba(7,9,12,0)_58%)]" />
        {/* the words */}
        <div className="wrap pointer-events-none relative h-full">
          {words.map((s, i) => (
            <div
              key={i}
              ref={(el) => { blockRefs.current[i] = el; }}
              className="absolute inset-x-4 top-[104px] will-change-[opacity,transform] sm:inset-x-8 md:top-1/2 lg:inset-x-10"
              style={i === 0 ? undefined : { opacity: 0, visibility: "hidden" }}
            >
              <div className="md:-translate-y-[56%]">
                {s ? <StepText word={s.word} line={s.line} last={i === 4} cta={cta} href={href} /> : <HeroText c={c} cta={cta} href={href} />}
              </div>
            </div>
          ))}

          {/* four-part progress mark */}
          <div ref={railRef} aria-hidden="true" className="absolute bottom-[max(28px,env(safe-area-inset-bottom))] left-4 flex gap-1.5 opacity-0 sm:left-8 lg:left-10">
            {[0, 1, 2, 3].map((k) => (
              <span key={k} className="block h-[3px] w-10 overflow-hidden rounded-full bg-fg/15 sm:w-14">
                <span ref={(el) => { segRefs.current[k] = el; }} className="block h-full w-full origin-left scale-x-0 bg-ice" />
              </span>
            ))}
          </div>

          <div ref={hintRef} aria-hidden="true" className="note absolute bottom-[max(24px,env(safe-area-inset-bottom))] left-4 flex items-center gap-3 uppercase tracking-[0.18em] text-mute sm:left-8 lg:left-10">
            <span className="scroll-hint block h-9 w-px bg-gradient-to-b from-ice to-transparent" />
            {c.scroll}
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroText({ c, cta, href }: { c: JourneyCopy; cta: string; href: string }) {
  return (
    <div className="pointer-events-auto max-w-[680px]">
      <h1 className="display text-[clamp(3.4rem,15.5vw,5.2rem)] text-fg md:text-[clamp(4.6rem,8.4vw,9.6rem)]">
        <span className="block">{c.h1[0]}</span>
        <span className="block text-ice">{c.h1[1]}</span>
      </h1>
      <p className="mt-5 text-[17px] leading-snug text-mute md:mt-7 md:text-[19px]">{c.sub}</p>
      <Link href={href} className="btn-primary mt-7 !h-14 !px-8 !text-[16px] md:mt-9">
        {cta}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4" /></svg>
      </Link>
    </div>
  );
}

function StepText({ word, line, last, cta, href }: { word: string; line: string; last: boolean; cta: string; href: string }) {
  return (
    <div className="max-w-[640px]">
      <h2 className={`display text-[clamp(3.2rem,15vw,5rem)] md:text-[clamp(4.4rem,8vw,9rem)] ${last ? "text-go" : "text-fg"}`}>{word}</h2>
      <p className="mt-4 max-w-[24ch] text-balance text-[18px] leading-snug text-fg/85 md:mt-6 md:text-[22px]">
        {/* one sentence per line where it fits: a line never breaks in the middle of a sentence it could hold */}
        {line.split(/(?<=[.。])\s*(?=\S)/).flatMap((s, i) => [i ? " " : "", <span key={i} className="inline-block">{s}</span>])}
      </p>
      {last && (
        <Link href={href} className="btn-primary pointer-events-auto mt-7 !h-14 !px-8 !text-[16px] md:mt-9">
          {cta}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4" /></svg>
        </Link>
      )}
    </div>
  );
}
