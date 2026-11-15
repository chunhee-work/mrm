"use client";
import { useEffect, useRef, useState } from "react";
import type React from "react";
import Link from "next/link";
import type { JourneyCopy } from "@/lib/landing-copy";
import { Wordmark } from "@/components/brand-mark";
import { canDrawLive3D } from "@/lib/gpu";

/**
 * The landing page's scroll journey: one pinned 3D stage, five stops.
 *   0 hero · 1 Upload · 2 Scan · 3 Autopilot · 4 Done (the ending: logo and sign-up, the car behind them)
 * The whole picture is a pure function of one number `t` in [0, 1]; scrolling only moves `t`.
 * Each stretch between two stops takes the same scroll distance and eases in and out, so the
 * camera arrives, rests and leaves: point to point.
 *
 * With reduced motion, or when there is no graphics card to draw on (no WebGL, or WebGL drawn on the
 * processor), the same five frames are shown as still pictures in an ordinary page (mode "still").
 * The live scene draws only while someone is there to see it: not off screen, not in a hidden tab,
 * and not after a minute without a scroll, a pointer or a key.
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

// how long the scene keeps breathing with nobody touching the page
const IDLE_MS = 60_000;

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

type Bay = { setProgress(t: number): void; setDock(d: { cx: number; cy: number; w: number; by: number; bh: number } | null): void; setPointer(x: number, y: number): void; render(timeMs: number): void; resize(): void; degrade(): boolean; dispose(): void };
type Mode = "boot" | "live" | "still";

export default function Journey({ c, cta, href, poster }: { c: JourneyCopy; cta: string; href: string; poster: { desktop: string[]; mobile: string[] } }) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blockRefs = useRef<(HTMLDivElement | null)[]>([]);
  const segRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const railRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const shadeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const oRef = useRef<SVGGElement>(null);
  const [mode, setMode] = useState<Mode>("boot");

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setMode("still"); return; }
    // ?still=1: no loop and no idle motion; a script sets t and reads the frame (used to render the posters)
    const capture = new URLSearchParams(window.location.search).has("still");
    // No WebGL 2, or only a software renderer: show the stills. Asked here, quietly, so the 3D library is never loaded for nothing.
    if (!canDrawLive3D(capture)) { setMode("still"); return; }

    let bay: Bay | null = null;
    let raf = 0;
    let alive = true;
    let visible = true;
    let awakeUntil = 0;
    let t = 0;
    let target = 0;
    let last = 0;
    let slow = 0;

    // the moving pieces of each block, looked up once
    const parts = blockRefs.current.map((el) => el ? {
      chars: Array.from(el.querySelectorAll<HTMLElement>("[data-ch]")),
      fill: el.querySelector<HTMLElement>("[data-fill]"),
      num: el.querySelector<HTMLElement>("[data-num]"),
      rule: el.querySelector<HTMLElement>("[data-rule]"),
      line: el.querySelector<HTMLElement>("[data-line]"),
    } : null);

    const paint = (tt: number) => {
      for (let i = 0; i < 5; i++) {
        const el = blockRefs.current[i];
        if (!el) continue;
        const [wa, wb, wc, wd] = WINDOWS[i];
        const a = alphaAt(tt, WINDOWS[i]);
        const pt = parts[i];
        const animated = !!pt && pt.chars.length > 0;
        el.style.visibility = a < 0.01 ? "hidden" : "visible";
        if (!animated) {
          // the hero: arrives from below, leaves upward, the same direction the page is moving
          el.style.opacity = a.toFixed(3);
          el.style.transform = `translate3d(0, ${((1 - a) * (tt < wb ? 28 : -28)).toFixed(1)}px, 0)`;
        } else if (pt) {
          // a step: its number lands, its word rises letter by letter out of a slot, a rule draws, the line follows.
          // It leaves the same way, upward. All of it is tied to the scroll, so it plays backwards too.
          const inP = wb <= wa ? 1 : clamp01((tt - wa) / (wb - wa));
          const outP = wd <= wc ? 0 : clamp01((tt - wc) / (wd - wc));
          el.style.opacity = Math.min(1, inP * 4, (1 - outP) * 4).toFixed(3);
          const n = pt.chars.length;
          for (let j = 0; j < n; j++) {
            const lag = (j / n) * 0.6;
            const up = smooth(clamp01(inP * 1.6 - lag));
            const off = smooth(clamp01(outP * 1.6 - lag));
            pt.chars[j].style.transform = `translate3d(0, ${((1 - up) * 108 - off * 108).toFixed(1)}%, 0)`;
          }
          const land = smooth(inP);
          if (pt.num) {
            pt.num.style.opacity = (land * (1 - smooth(outP))).toFixed(3);
            pt.num.style.transform = `translate3d(${((1 - land) * -26).toFixed(1)}px, ${(-smooth(outP) * 30).toFixed(1)}px, 0) scale(${(1 + (1 - land) * 0.22).toFixed(3)})`;
          }
          // the number fills with light while you stay on its step
          if (pt.fill) pt.fill.style.clipPath = `inset(${((1 - smooth(clamp01((tt - wb + 0.02) / Math.max(0.01, Math.min(wc, 1) - wb + 0.02)))) * 100).toFixed(1)}% 0 0 0)`;
          if (pt.rule) pt.rule.style.transform = `scaleX(${(smooth(clamp01(inP * 1.5 - 0.3)) * (1 - smooth(outP))).toFixed(3)})`;
          if (pt.line) {
            const k = smooth(clamp01(inP * 2 - 1)) * (1 - smooth(clamp01(outP * 2)));
            pt.line.style.opacity = k.toFixed(3);
            pt.line.style.transform = `translate3d(0, ${((1 - k) * (outP > 0 ? -14 : 14)).toFixed(1)}px, 0)`;
          }
        }
        const shade = shadeRefs.current[i];
        if (shade) shade.style.opacity = a.toFixed(3);
      }
      const end = alphaAt(tt, WINDOWS[4]);
      // the ending's logo is an object in the 3D room; the page only keeps its place, and tells the room where that is
      const mark = oRef.current?.ownerSVGElement;
      if (mark && bay && tt > 0.84) {
        const r = mark.getBoundingClientRect();
        const b = (mark.parentElement ?? mark).getBoundingClientRect();
        const c = canvas.getBoundingClientRect();
        bay.setDock(r.width > 0 ? { cx: r.left + r.width / 2 - c.left, cy: r.top + r.height / 2 - c.top, w: r.width, by: b.top + b.height / 2 - c.top, bh: b.height } : null);
      }
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

    // the loop runs only while the stage is on screen, the tab is showing and someone has touched the page lately
    const watched = () => alive && !!bay && visible && !document.hidden && performance.now() < awakeUntil;
    const run = () => { if (!raf && watched()) { last = 0; raf = requestAnimationFrame(frame); } };
    const wake = () => { awakeUntil = performance.now() + IDLE_MS; run(); };
    const frame = (now: number) => {
      raf = 0;
      if (!watched() || !bay) return;
      raf = requestAnimationFrame(frame);
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

    // the head lamps at the ending lean after the mouse; a finger on a touch screen is scrolling, not pointing
    const onPointer = (e: PointerEvent) => {
      wake();
      if (e.pointerType === "touch" || !bay) return;
      bay.setPointer((e.clientX / window.innerWidth) * 2 - 1, 1 - (e.clientY / window.innerHeight) * 2);
    };
    const onPointerGone = () => bay?.setPointer(0, 0);
    const onScroll = () => { measure(); wake(); };
    const onResize = () => { bay?.resize(); measure(); wake(); };
    const onShown = () => { if (!document.hidden) wake(); };
    const io = new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); run(); }, { rootMargin: "120px" });

    (async () => {
      try {
        const { createBay } = await import("./bay");
        if (!alive) return;
        // ?still=1&bot=face (or lens): a script may ask for the other ball, to picture the two side by side
        const asked = capture ? new URLSearchParams(window.location.search).get("bot") : null;
        const made = await createBay(canvas, { mobile: window.matchMedia("(max-width: 767px)").matches, bot: asked === "face" || asked === "lens" ? asked : undefined });
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
          const w = window as unknown as { __setT?: (v: number, time?: number) => void; __setPointer?: (x: number, y: number) => void; __bayReady?: boolean };
          w.__setT = (v: number, time = 0) => { t = target = v; paint(v); bay!.setProgress(v); bay!.render(time); };
          w.__setPointer = (x: number, y: number) => bay!.setPointer(x, y);
          w.__bayReady = true;
          return;
        }
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onResize);
        window.addEventListener("pointermove", onPointer, { passive: true });
        window.addEventListener("pointerdown", wake, { passive: true });
        window.addEventListener("keydown", wake);
        document.addEventListener("visibilitychange", onShown);
        document.documentElement.addEventListener("pointerleave", onPointerGone);
        io.observe(section);
        wake();
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
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
      document.removeEventListener("visibilitychange", onShown);
      document.documentElement.removeEventListener("pointerleave", onPointerGone);
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
            <div aria-hidden="true" className={`${SHADE[i]} opacity-100`} />
            <div className={`wrap relative ${i === 1 ? "md:flex md:justify-end" : ""}`}>
              {!s ? <HeroText c={c} cta={cta} href={href} /> : i === 4 ? <EndText word={s.word} line={s.line} cta={cta} href={href} /> : <StepText n={i} word={s.word} line={s.line} />}
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

        {/* a shadow for each block of words to stand in, wherever in the frame that block is */}
        {[0, 1, 2, 3].map((i) => (
          <div key={i} ref={(el) => { shadeRefs.current[i] = el; }} aria-hidden="true" data-shade="" className={SHADE[i]} style={i === 0 ? undefined : { opacity: 0 }} />
        ))}
        {/* the words */}
        <div className="wrap pointer-events-none relative h-full">
          {words.map((s, i) => (
            <div
              key={i}
              ref={(el) => { blockRefs.current[i] = el; }}
              className={`absolute inset-x-4 will-change-[opacity,transform] sm:inset-x-8 lg:inset-x-10 ${PLACE[i]}`}
              style={i === 0 ? undefined : { opacity: 0, visibility: "hidden" }}
            >
              <div className={INNER[i]}>
                {!s ? <HeroText c={c} cta={cta} href={href} /> : i === 4 ? <EndText word={s.word} line={s.line} cta={cta} href={href} oRef={oRef} live={mode === "live"} /> : <StepText n={i} word={s.word} line={s.line} />}
              </div>
            </div>
          ))}

          {/* four-part progress mark */}
          <div ref={railRef} aria-hidden="true" className="absolute bottom-[max(28px,env(safe-area-inset-bottom))] left-1/2 flex -translate-x-1/2 gap-1.5 opacity-0">
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

// Where each block of words stands on a wide screen: the hero on the left, Upload on the right, Scan at the bottom left,
// Autopilot at the top left, the ending in the middle. On a phone they all stand at the top, the ending in the middle.
const PLACE = [
  "top-[104px] md:top-1/2",
  "top-[104px] md:top-1/2 md:flex md:justify-end",
  "top-[104px] md:bottom-[12%] md:top-auto",
  "top-[104px] md:top-[15%]",
  "top-[40%] md:top-[38%]",
];
const INNER = ["md:-translate-y-[56%]", "md:-translate-y-[56%]", "", "", "-translate-y-1/2"];
const SHADE_BASE = "pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,9,12,0.92)_0%,rgba(7,9,12,0.6)_30%,rgba(7,9,12,0)_52%)]";
const SHADE = [
  `${SHADE_BASE} md:bg-[linear-gradient(90deg,rgba(7,9,12,0.9)_0%,rgba(7,9,12,0.62)_30%,rgba(7,9,12,0)_58%)]`,
  `${SHADE_BASE} md:bg-[linear-gradient(270deg,rgba(7,9,12,0.9)_0%,rgba(7,9,12,0.62)_28%,rgba(7,9,12,0)_54%)]`,
  `${SHADE_BASE} md:bg-[radial-gradient(ellipse_62%_58%_at_0%_100%,rgba(7,9,12,0.94)_0%,rgba(7,9,12,0.7)_45%,rgba(7,9,12,0)_100%)]`,
  `${SHADE_BASE} md:bg-[radial-gradient(ellipse_62%_58%_at_0%_0%,rgba(7,9,12,0.94)_0%,rgba(7,9,12,0.7)_45%,rgba(7,9,12,0)_100%)]`,
  // the ending: darkest behind the words, the car still showing round them
  "pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_62%_44%_at_50%_34%,rgba(7,9,12,0.8)_0%,rgba(7,9,12,0.55)_55%,rgba(7,9,12,0)_100%)]",
];

const Arrow = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4" /></svg>;

function HeroText({ c, cta, href }: { c: JourneyCopy; cta: string; href: string }) {
  return (
    <div className="pointer-events-auto max-w-[720px]">
      <h1 className="jd jd-hero text-[clamp(3rem,13.4vw,4.8rem)] md:text-[clamp(3.8rem,6.6vw,7.8rem)]">
        <span className="jd-thin block">{c.h1[0]}</span>
        <span className="jd-steel block">{c.h1[1]}</span>
      </h1>
      <p className="mt-5 text-[17px] leading-snug text-mute md:mt-7 md:text-[19px]">{c.sub}</p>
      <Link href={href} className="btn-hero mt-7 md:mt-9">
        {cta}
        <Arrow />
      </Link>
    </div>
  );
}

// one sentence per line where it fits: a line never breaks in the middle of a sentence it could hold
const sentences = (line: string) => line.split(/(?<=[.。])\s*(?=\S)/).flatMap((x, i) => [i ? " " : "", <span key={i} className="inline-block">{x}</span>]);

/** A word as letters, each in its own slot, so the page can raise them one after another. */
function Letters({ text }: { text: string }) {
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="inline-flex flex-wrap">
        {Array.from(text).map((ch, i) => (
          <span key={i} className="jd-slot"><span data-ch="" className="jd-steel inline-block will-change-transform">{ch === " " ? " " : ch}</span></span>
        ))}
      </span>
    </>
  );
}

function StepText({ n, word, line }: { n: number; word: string; line: string }) {
  return (
    <div className="max-w-[640px]">
      <div className="flex items-end gap-4 md:gap-6">
        {/* the step's number: an outline that fills with light */}
        <span data-num="" aria-hidden="true" className="jd-num relative block text-[clamp(4.6rem,21vw,7rem)] md:text-[clamp(6.5rem,10.5vw,12.5rem)]">
          <span className="jd-num-line">{n}</span>
          <span data-fill="" className="jd-num-fill absolute inset-0">{n}</span>
        </span>
        <h2 className="jd pb-[0.14em] text-[clamp(2.6rem,11.6vw,4rem)] md:text-[clamp(3.3rem,5.5vw,6.6rem)]"><span className="sr-only">{n}. </span><Letters text={word} /></h2>
      </div>
      <span data-rule="" aria-hidden="true" className="mt-4 block h-px w-full max-w-[420px] origin-left bg-gradient-to-r from-ice/80 to-ice/0 md:mt-5" />
      <p data-line="" className="mt-4 max-w-[26ch] text-balance text-[18px] leading-snug text-fg/85 md:mt-5 md:text-[21px]">{sentences(line)}</p>
    </div>
  );
}

/** The ending: the logo, the last word, and the way in. Centred, with the finished car facing you under it. */
function EndText({ word, line, cta, href, oRef, live = false }: { word: string; line: string; cta: string; href: string; oRef?: React.Ref<SVGGElement>; /** the 3D room is drawing the logo: keep its place and its name, not its picture */ live?: boolean }) {
  return (
    <div className="mx-auto flex max-w-[860px] flex-col items-center text-center">
      {/* the logo is the last picture; the word under it is a stamp on the finished job, not a second headline */}
      <Wordmark className={`h-[46px] w-auto text-fg sm:h-[60px] md:h-[clamp(72px,6.6vw,104px)] ${live ? "opacity-0" : ""}`} oRef={oRef} />
      <h2 className="jd jd-go jd-tag mt-5 flex items-center gap-4 text-[17px] md:mt-7 md:gap-5 md:text-[22px]">
        <span aria-hidden="true" className="block h-px w-10 bg-gradient-to-r from-go/0 to-go/70 md:w-16" />
        <span className="jd-tag-word"><Letters text={word} /></span>
        <span aria-hidden="true" className="block h-px w-10 bg-gradient-to-r from-go/70 to-go/0 md:w-16" />
      </h2>
      <p data-line="" className="mt-3 text-balance text-[15px] leading-snug text-fg/70 md:mt-4 md:text-[17px]">{sentences(line)}</p>
      <Link href={href} className="btn-hero pointer-events-auto mt-7 md:mt-9">
        {cta}
        <Arrow />
      </Link>
    </div>
  );
}
