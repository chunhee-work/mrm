"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { JourneyCopy } from "@/lib/landing-copy";
import { Wordmark } from "@/components/brand-mark";

/**
 * The landing page's scroll journey: one pinned 3D stage, five stops.
 *   0 hero · 1 Upload · 2 Scan · 3 Autopilot · 4 Done (the ending: logo and sign-up, the car behind them)
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
  const sideRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
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
      // the ending stands in the middle of the frame: the side shadow gives way to one behind the centre
      const end = alphaAt(tt, WINDOWS[4]);
      if (sideRef.current) sideRef.current.style.opacity = (1 - end).toFixed(3);
      if (endRef.current) endRef.current.style.opacity = end.toFixed(3);
      const rail = railRef.current;
      if (rail) rail.style.opacity = ((1 - alphaAt(tt, WINDOWS[0])) * (1 - end)).toFixed(3);
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
        const made = await createBay(canvas, { mobile: window.matchMedia("(max-width: 767px)").matches });
        if (!alive) { made.dispose(); return; }
        bay = made;
        measure();
        t = target;
        bay.setProgress(t);
        bay.render(performance.now());
        paint(t);
        setMode("live");
        if (capture) {
          // `time` (ms) is for filming: it runs the idle motion on a clock of the script's own
          const w = window as unknown as { __setT?: (v: number, time?: number) => void; __bayReady?: boolean };
          w.__setT = (v: number, time = 0) => { t = target = v; paint(v); bay!.setProgress(v); bay!.render(time); };
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
          <div key={i} className={`relative flex min-h-[100svh] flex-col overflow-hidden ${i === 4 ? "justify-center" : "justify-start pt-[112px] md:justify-center md:pt-0"}`}>
            <picture>
              <source media="(max-width: 767px)" srcSet={poster.mobile[i]} />
              <img src={poster.desktop[i]} alt="" className="absolute inset-0 h-full w-full object-cover" loading={i ? "lazy" : "eager"} />
            </picture>
            <div className="wrap relative">
              {!s ? <HeroText c={c} cta={cta} href={href} /> : i === 4 ? <EndText word={s.word} line={s.line} cta={cta} href={href} /> : <StepText word={s.word} line={s.line} />}
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
        <div ref={sideRef} aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,9,12,0.92)_0%,rgba(7,9,12,0.6)_30%,rgba(7,9,12,0)_52%)] md:bg-[linear-gradient(90deg,rgba(7,9,12,0.9)_0%,rgba(7,9,12,0.62)_30%,rgba(7,9,12,0)_58%)]" />
        <div ref={endRef} aria-hidden="true" className={END_SHADE} style={{ opacity: 0 }} />
        {/* the words */}
        <div className="wrap pointer-events-none relative h-full">
          {words.map((s, i) => (
            <div
              key={i}
              ref={(el) => { blockRefs.current[i] = el; }}
              className={`absolute inset-x-4 will-change-[opacity,transform] sm:inset-x-8 lg:inset-x-10 ${i === 4 ? "top-1/2" : "top-[104px] md:top-1/2"}`}
              style={i === 0 ? undefined : { opacity: 0, visibility: "hidden" }}
            >
              <div className={i === 4 ? "-translate-y-[54%]" : "md:-translate-y-[56%]"}>
                {!s ? <HeroText c={c} cta={cta} href={href} /> : i === 4 ? <EndText word={s.word} line={s.line} cta={cta} href={href} /> : <StepText word={s.word} line={s.line} />}
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

// one sentence per line where it fits: a line never breaks in the middle of a sentence it could hold
const sentences = (line: string) => line.split(/(?<=[.。])\s*(?=\S)/).flatMap((x, i) => [i ? " " : "", <span key={i} className="inline-block">{x}</span>]);
// the shadow the ending stands in: darkest behind the words, the car still showing round them
const END_SHADE = "pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_46%,rgba(7,9,12,0.74)_0%,rgba(7,9,12,0.55)_45%,rgba(7,9,12,0.2)_100%)]";

function StepText({ word, line }: { word: string; line: string }) {
  return (
    <div className="max-w-[640px]">
      <h2 className="display text-[clamp(3.2rem,15vw,5rem)] text-fg md:text-[clamp(4.4rem,8vw,9rem)]">{word}</h2>
      <p className="mt-4 max-w-[24ch] text-balance text-[18px] leading-snug text-fg/85 md:mt-6 md:text-[22px]">{sentences(line)}</p>
    </div>
  );
}

/** The ending: the logo, the last word, and the way in. Centred, with the finished car behind it. */
function EndText({ word, line, cta, href }: { word: string; line: string; cta: string; href: string }) {
  return (
    <div className="mx-auto flex max-w-[720px] flex-col items-center text-center">
      <Wordmark className="h-[34px] w-auto text-fg md:h-[46px]" />
      <h2 className="display mt-7 text-[clamp(3.6rem,17vw,5.6rem)] text-go md:mt-9 md:text-[clamp(5rem,9vw,10rem)]">{word}</h2>
      <p className="mt-4 text-balance text-[18px] leading-snug text-fg/90 md:mt-5 md:text-[22px]">{sentences(line)}</p>
      <Link href={href} className="btn-primary pointer-events-auto mt-8 !h-14 !px-9 !text-[16px] md:mt-10">
        {cta}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4" /></svg>
      </Link>
    </div>
  );
}
