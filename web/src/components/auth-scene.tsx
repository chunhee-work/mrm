"use client";
import { useEffect, useRef, useState } from "react";
import { canDrawLive3D } from "@/lib/gpu";

const SCAN = 0.45; // the landing page's Scan stop: the ball over the bonnet, the car in its light net
const TURN = Math.PI * 1.15; // a drag across the whole picture turns the car a little more than half way round
const NUDGE = -0.42; // it arrives turned this far and settles, so the reader sees that it turns
const AUTO = 0.0001; // left alone, the car turns by itself: radians per ms, a little over a minute for one turn
const SWAY = 0.34; // the ball drifts this far to each side of its place, in radians round the car
const SWAY_MS = 23000; // one drift there and back
const IDLE_MS = 90_000; // with nobody touching the page for this long, the picture rests

/**
 * The picture behind the account pages (wide screens only): the bay, mid-scan, drawn in ink on the white page.
 * It starts as a still. Where the browser can draw 3D, the same frame is then drawn live in its place: the car turns
 * slowly by itself, the ball drifts a little round it with its light on the car, and the reader can take hold of the car
 * and turn it, left and right only. The ball is not carried round with the car: it keeps to its own place and its own
 * slow drift, whatever the hand does (owner 2026-11-15). The 3D library and the models are fetched only then, and only
 * after the form is on screen. Reduced motion, no graphics card, a phone: the still stays.
 */
export default function AuthScene() {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = box.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // ?still=1: no loop; a script turns the car itself and takes the picture (as on the landing page)
    const capture = new URLSearchParams(window.location.search).has("still");
    // a software renderer would turn the fan on for a log-in page; a script that takes pictures may ask for it anyway
    if (!canDrawLive3D(capture)) return;

    let alive = true;
    let raf = 0;
    let bay: Awaited<ReturnType<typeof import("./landing/bay").createBay>> | null = null;
    let spin = NUDGE; // where the car is
    let want = 0; // where it is going
    let held = false;
    let lastX = 0;
    let coast = 0; // radians per ms after letting go
    let auto = 0; // radians per ms of its own slow turn; it picks up again a moment after the hand lets go
    let clock = 0; // ms the picture has been running, for the ball's drift
    let awakeUntil = 0;
    let lastT = 0;
    let slow = 0;
    let frames = 0;

    // the picture fades out towards its edges, and the ball sits near one: a small clear patch in that fade goes with it
    const follow = () => {
      if (!bay) return;
      const [x, y] = bay.botAt();
      el.style.setProperty("--bx", `${(x * 100).toFixed(2)}%`);
      el.style.setProperty("--by", `${(y * 100).toFixed(2)}%`);
    };
    const frame = (now: number) => {
      raf = 0;
      if (!alive || !bay) return;
      const dt = lastT ? Math.min(64, now - lastT) : 16;
      lastT = now;
      clock += dt;
      if (!held) {
        want += coast * dt;
        coast *= Math.exp(-dt / 320);
        // its own turn eases in after the hand lets go, and eases out when the picture is about to rest
        auto += ((idle || performance.now() >= awakeUntil ? 0 : AUTO) - auto) * (1 - Math.exp(-dt / 1400));
        want += auto * dt;
      } else auto = 0;
      spin += (want - spin) * (1 - Math.exp(-dt / (held ? 60 : 220)));
      bay.setSpin(spin);
      // the ball is not on the turntable: it keeps its place while the car turns under it, and drifts a little on its own
      bay.setBotDrift(SWAY * Math.sin((clock / SWAY_MS) * Math.PI * 2));
      bay.render(now);
      follow();
      // a machine that cannot keep up: draw less, then only when the car is being turned
      if (dt > 42) slow++;
      if (++frames === 90) {
        if (slow > 45 && !bay.degrade()) idle = true;
        frames = 0; slow = 0;
      }
      // it keeps moving while someone is there: the tab showing, the page touched not long ago. A machine that cannot
      // keep up (idle) draws only while the car is being turned
      const turning = held || Math.abs(want - spin) > 0.002 || Math.abs(coast) > 0.00002 || auto > AUTO * 0.02;
      if (!document.hidden && (turning || (!idle && performance.now() < awakeUntil))) raf = requestAnimationFrame(frame);
    };
    let idle = false;
    const draw = (time: number, sway = 0) => { if (!bay) return; bay.setSpin(spin); bay.setBotDrift(sway); bay.render(time); follow(); };
    const wake = () => {
      if (!alive || !bay) return;
      // a script taking pictures has no loop: each change is drawn once, at once
      if (capture) { spin = want; draw(0); return; }
      awakeUntil = performance.now() + IDLE_MS;
      if (!raf && !document.hidden) { lastT = 0; raf = requestAnimationFrame(frame); }
    };

    const onDown = (e: PointerEvent) => {
      if (!bay || (e.pointerType === "mouse" && e.button !== 0)) return;
      held = true; lastX = e.clientX; coast = 0;
      el.setPointerCapture(e.pointerId);
      el.dataset.held = "true";
      wake();
    };
    const onMove = (e: PointerEvent) => {
      if (!held) return;
      const d = ((e.clientX - lastX) / Math.max(1, cv.clientWidth)) * TURN;
      lastX = e.clientX;
      want += d;
      coast = coast * 0.6 + (d / 16) * 0.4;
      wake();
    };
    const onUp = (e: PointerEvent) => {
      if (!held) return;
      held = false;
      delete el.dataset.held;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      wake();
    };
    const onVisible = () => { if (!document.hidden) wake(); };

    const start = async () => {
      try {
        const { createBay } = await import("./landing/bay");
        if (!alive) return;
        const made = await createBay(cv, { mobile: false, bot: "face", ink: true });
        if (!alive) { made.dispose(); return; }
        bay = made;
        bay.setProgress(SCAN);
        if (capture) spin = 0;
        draw(capture ? 0 : performance.now());
        setLive(true);
        el.addEventListener("pointerdown", onDown);
        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerup", onUp);
        el.addEventListener("pointercancel", onUp);
        document.addEventListener("visibilitychange", onVisible);
        // anything the reader does anywhere on the page keeps the picture moving
        window.addEventListener("pointermove", wake, { passive: true });
        window.addEventListener("keydown", wake);
        // for scripts: the car's turn, the clock the light and the motes run on (ms), and how far the ball has drifted
        (window as unknown as { __authSpin?: (rad: number, time?: number, sway?: number) => void }).__authSpin = (rad, time = 0, sway = 0) => { spin = want = rad; coast = 0; draw(time, sway); };
        wake();
      } catch { /* the still stays */ }
    };
    // the form first: the picture can wait until the page has nothing better to do
    const later = window.setTimeout(() => void start(), 500);

    return () => {
      alive = false;
      window.clearTimeout(later);
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
      bay?.dispose();
    };
  }, []);

  return (
    <div ref={box} className="auth-scene" data-live={live || undefined} aria-hidden="true">
      <img className="auth-scene-ink" src="/landing/bay-2.jpg" alt="" draggable={false} />
      <img className="auth-scene-bot" src="/landing/bay-2.jpg" alt="" draggable={false} />
      <canvas ref={canvas} className="auth-scene-ink auth-scene-live" />
    </div>
  );
}
