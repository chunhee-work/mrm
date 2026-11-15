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

function paint(pose: Pose): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const c = canvas.getContext("2d");
  if (!c || typeof Path2D === "undefined") return null;
  const { cx, cy } = W.o;
  const eyeY = 256.75; // the middle of the eyes, so they shut toward their own centre

  c.scale(SIZE / 48, SIZE / 48);
  c.fillStyle = "#07090C";
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

  c.fillStyle = "#EEF2F6";
  c.fill(new Path2D(W.face), "evenodd");

  c.translate(pose.look, eyeY);
  c.scale(1, pose.open);
  c.translate(0, -eyeY);
  c.fillStyle = "#FFFFFF";
  for (const eye of W.eyes) c.fill(new Path2D(eye));

  return canvas.toDataURL("image/png");
}

export function TabIcon() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const frames = new Map<string, string | null>();
    const frame = (p: Pose) => {
      const key = `${p.open}|${p.look}`;
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
  }, []);

  return null;
}
