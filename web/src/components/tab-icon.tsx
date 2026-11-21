"use client";

import { useEffect } from "react";
import { WORDMARK as W } from "./brand-data";

/**
 * The browser-tab icon, alive: the logo's first "o" (the scan ball's face) blinks and glances to the side.
 * A tab icon cannot animate on its own in Chrome, so the frames are drawn here and swapped into the page's
 * icon link. Where the browser ignores a changed icon (Safari), the still icon from icon.svg stays.
 */

type Pose = { open: number; look: number }; // eyes: 1 open … 0.1 shut; look: sideways shift in font units
type Step = [Pose, number]; // hold, ms

const SIZE = 64;
const LOOK = 40;
const OPEN: Pose = { open: 1, look: 0 };
const blink: Step[] = [[{ open: 0.5, look: 0 }, 50], [{ open: 0.1, look: 0 }, 80], [{ open: 0.5, look: 0 }, 50]];
const glance = (side: 1 | -1): Step[] => [
  [{ open: 1, look: side * LOOK * 0.5 }, 60],
  [{ open: 1, look: side * LOOK }, 900],
  [{ open: 1, look: side * LOOK * 0.5 }, 60],
];
/** While the tab is in front: blink, glance right, blink, glance left. About 13 s a round. */
const AWAKE: Step[] = [[OPEN, 2600], ...blink, [OPEN, 2200], ...glance(1), [OPEN, 1800], ...blink, [OPEN, 2400], ...glance(-1), [OPEN, 600]];
/** While the tab is behind others the browser only lets a page tick about once a second: slow glances only. */
const ASIDE: Step[] = [[OPEN, 5000], [{ open: 1, look: LOOK }, 1000], [OPEN, 5000], [{ open: 1, look: -LOOK }, 1000]];

/**
 * R3-B04 (React error #418, about 2 to 3 % of loads, on every page): the icon links live in <head>, which React hydrates together with the page.
 * This file used to change them (and add one) the moment it mounted, which on some loads happened before React had matched <head> against the
 * server's HTML: "Hydration failed because the server rendered HTML didn't match the client". So nothing here touches <head> until the page has
 * finished loading and has been idle for a moment (HYDRATED_MS after the load event; hydration of this page takes a few hundred ms).
 * `after(fn)` runs fn then, and returns the way to cancel.
 */
export const HYDRATED_MS = 2500;
export function afterHydration(fn: () => void | (() => void)): () => void {
  let cancel: (() => void) | void;
  let timer = 0;
  let waiting = false;
  const go = () => { waiting = false; timer = window.setTimeout(() => { cancel = fn(); }, HYDRATED_MS); };
  if (document.readyState === "complete") go();
  else { waiting = true; window.addEventListener("load", go, { once: true }); }
  return () => {
    window.clearTimeout(timer);
    if (waiting) window.removeEventListener("load", go);
    if (cancel) cancel();
  };
}

/** /admin only: the admin layout flips this so the icon is black on white and tells itself apart from the dark site tabs. */
let inverted = false;
const ADMIN_STILL = "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 48 48%22%3E%3Crect width=%2248%22 height=%2248%22 rx=%229%22 fill=%22%23FFFFFF%22/%3E%3Cg transform=%22translate%2824.0 24.0%29 scale%280.07283 -0.07283%29 translate%28-1795.6 -241.5%29 rotate%287 1795.6 241.5%29%22%3E%3Cpath fill=%22%2307090C%22 fill-rule=%22evenodd%22 d=%22M1541.6 241.5A254.0 254.0 0 1 0 2049.6 241.5A254.0 254.0 0 1 0 1541.6 241.5ZM1732.1 147.5L1859.1 147.5A109.2 109.2 0 0 1 1859.1 366.0L1732.1 366.0A109.2 109.2 0 0 1 1732.1 147.5Z%22/%3E%3Cpath fill=%22%2307090C%22 d=%22M1687.0 226.9A29.8 29.8 0 0 1 1746.7 226.9L1746.7 286.6A29.8 29.8 0 0 1 1687.0 286.6ZM1844.5 226.9A29.8 29.8 0 0 1 1904.2 226.9L1904.2 286.6A29.8 29.8 0 0 1 1844.5 286.6Z%22/%3E%3C/g%3E%3C/svg%3E";
export function AdminTabIcon() {
  inverted = true; // set while rendering, so the very first frame is already inverted
  useEffect(() => {
    // Still version for browsers that do not animate the tab icon (reduced motion, Safari).
    const stop = afterHydration(() => {
      for (const link of document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')) { link.type = "image/svg+xml"; link.href = ADMIN_STILL; }
    });
    return () => { stop(); inverted = false; };
  }, []);
  return null;
}

function paint(pose: Pose): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const c = canvas.getContext("2d");
  if (!c || typeof Path2D === "undefined") return null;
  const { cx, cy } = W.o;
  const eyeY = 256.75; // the middle of the eyes, so they shut toward their own centre

  c.scale(SIZE / 48, SIZE / 48);
  c.fillStyle = inverted ? "#FFFFFF" : "#07090C";
  c.beginPath();
  if (c.roundRect) c.roundRect(0, 0, 48, 48, 9);
  else c.rect(0, 0, 48, 48);
  c.fill();

  // the same placement as icon.svg: the "o" centred, y up, tilted 7 degrees
  c.translate(24, 24);
  c.scale(0.07283, -0.07283);
  c.translate(-cx, -cy);
  c.translate(cx, cy);
  c.rotate((7 * Math.PI) / 180);
  c.translate(-cx, -cy);

  c.fillStyle = inverted ? "#07090C" : "#EEF2F6";
  c.fill(new Path2D(W.face), "evenodd");

  c.translate(pose.look, eyeY);
  c.scale(1, pose.open);
  c.translate(0, -eyeY);
  c.fillStyle = inverted ? "#07090C" : "#FFFFFF";
  for (const eye of W.eyes) c.fill(new Path2D(eye));

  return canvas.toDataURL("image/png");
}

export function TabIcon() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    return afterHydration(start);
  }, []);
  return null;
}

function start(): void | (() => void) {
    const frames = new Map<string, string | null>();
    const frame = (p: Pose) => {
      const key = `${p.open}|${p.look}|${inverted}`;
      if (!frames.has(key)) frames.set(key, paint(p));
      return frames.get(key) ?? null;
    };
    if (!frame(OPEN)) return;

    const first = new Map<HTMLLinkElement, { href: string; type: string | null }>();
    const show = (p: Pose) => {
      const src = frame(p);
      if (!src) return;
      let links = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'));
      if (!links.length) {
        const made = document.createElement("link");
        made.rel = "icon";
        document.head.appendChild(made);
        links = [made];
      }
      for (const link of links) {
        if (!first.has(link)) first.set(link, { href: link.getAttribute("href") ?? "", type: link.getAttribute("type") });
        link.type = "image/png";
        link.href = src;
      }
    };

    let timer = 0;
    let at = 0;
    let steps = document.hidden ? ASIDE : AWAKE;
    const tick = () => {
      const [pose, hold] = steps[at];
      show(pose);
      at = (at + 1) % steps.length;
      timer = window.setTimeout(tick, hold);
    };
    const onVisibility = () => {
      window.clearTimeout(timer);
      steps = document.hidden ? ASIDE : AWAKE;
      at = 0;
      tick();
    };

    tick();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      for (const [link, was] of first) {
        if (!link.isConnected) continue;
        if (was.type) link.type = was.type;
        else link.removeAttribute("type");
        if (was.href) link.href = was.href;
      }
    };
}
