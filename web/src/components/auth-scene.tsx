"use client";
import { useEffect, useRef, useState } from "react";

const SCAN = 0.45; // the landing page's Scan stop: the ball over the bonnet, the car in its light net
const TURN = Math.PI * 1.15; // a drag across the whole picture turns the car a little more than half way round
const NUDGE = -0.42; // it arrives turned this far and settles, so the reader sees that it turns

/**
 * The picture behind the account pages (wide screens only): the bay, mid-scan, drawn in ink on the white page.
 * It starts as a still. Where the browser can draw 3D, the same frame is then drawn live in its place and the reader can
 * take hold of it and turn the car, left and right only (owner 2026-11-15). The 3D library and the models are fetched
 * only then, and only after the form is on screen. Reduced motion, no WebGL 2, a phone: the still stays.
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
    try {
      const gl = document.createElement("canvas").getContext("webgl2");
      if (!gl) return;
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
      // a software renderer would turn the fan on for a log-in page; a script that takes pictures may ask for it anyway
      if (/swiftshader|llvmpipe|software/i.test(name) && !capture) return;
    } catch { return; }

    let alive = true;
    let raf = 0;
    let bay: Awaited<ReturnType<typeof import("./landing/bay").createBay>> | null = null;
    let spin = NUDGE; // where the car is
    let want = 0; // where it is going
    let held = false;
    let lastX = 0;
    let coast = 0; // radians per ms after letting go
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
      if (!held) {
        want += coast * dt;
        coast *= Math.exp(-dt / 320);
      }
      spin += (want - spin) * (1 - Math.exp(-dt / (held ? 60 : 220)));
      bay.setSpin(spin);
      bay.render(now);
      follow();
      // a machine that cannot keep up: draw less, then only when the car is being turned
      if (dt > 42) slow++;
      if (++frames === 90) {
        if (slow > 45 && !bay.degrade()) idle = true;
        frames = 0; slow = 0;
      }
      if (!document.hidden && (!idle || held || Math.abs(want - spin) > 0.002 || Math.abs(coast) > 0.00002)) raf = requestAnimationFrame(frame);
    };
    let idle = false;
    const wake = () => {
      if (!alive || !bay) return;
      // a script taking pictures has no loop: each change is drawn once, at once
      if (capture) { spin = want; bay.setSpin(spin); bay.render(0); follow(); return; }
      if (!raf) { lastT = 0; raf = requestAnimationFrame(frame); }
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
        bay.setSpin(spin);
        bay.render(capture ? 0 : performance.now());
        follow();
        setLive(true);
        el.addEventListener("pointerdown", onDown);
        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerup", onUp);
        el.addEventListener("pointercancel", onUp);
        document.addEventListener("visibilitychange", onVisible);
        (window as unknown as { __authSpin?: (rad: number) => void }).__authSpin = (rad) => { spin = want = rad; coast = 0; bay!.setSpin(rad); bay!.render(0); follow(); };
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
