import type React from "react";
import { SITE } from "@/lib/site";
import { WORDMARK as W } from "./brand-data";

/**
 * The logo: the name in one word, lower case. Its first "o" is either the mascot's face (the scan ball:
 * a white ball, a visor, two lights for eyes) or a steering wheel. One switch for the whole site.
 */
export type FirstO = "bot" | "wheel";
export const FIRST_O: FirstO = "bot";

function O({ kind, oRef }: { kind: FirstO; oRef?: React.Ref<SVGGElement> }) {
  if (kind === "wheel") {
    const { ring, mid, spoke, hub, ends } = W.wheel;
    return (
      <g stroke="currentColor" fill="none">
        <circle cx={W.o.cx} cy={W.o.cy} r={mid} strokeWidth={ring} />
        <circle cx={W.o.cx} cy={W.o.cy} r={hub} fill="currentColor" stroke="none" />
        {ends.map(([x, y], i) => <line key={i} x1={W.o.cx} y1={W.o.cy} x2={x} y2={y} strokeWidth={spoke} />)}
      </g>
    );
  }
  return (
    <g ref={oRef} transform={`rotate(7 ${W.o.cx} ${W.o.cy})`}>
      {/* the visor is cut out of the ball, so whatever is behind the logo shows through it;
          on a white page there is nothing dark behind it, so there the visor is filled in (see .logo-visor) */}
      <circle className="logo-visor" cx={W.o.cx} cy={W.o.cy} r={W.o.r - 6} />
      <path fillRule="evenodd" d={W.face} />
      <g className="logo-eyes" fill="var(--logo-eye)">
        {W.eyes.map((d) => <path key={d} d={d} />)}
      </g>
    </g>
  );
}

/** The full wordmark. Set its height with a class; the width follows. */
export function Wordmark({ className = "", kind = FIRST_O, oRef }: { className?: string; kind?: FirstO; /** the "o" itself, for the landing page's ending, where the scan ball flies into it */ oRef?: React.Ref<SVGGElement> }) {
  return (
    <svg viewBox={W.viewBox} className={className} fill="currentColor" role="img" aria-label={SITE.brand}>
      <g transform="scale(1,-1)">
        <path d={W.letters} />
        <O kind={kind} oRef={oRef} />
      </g>
    </svg>
  );
}

/** The first "o" on its own, for places too small for the word. */
export function BrandMark({ size = 26, kind = FIRST_O }: { size?: number; kind?: FirstO }) {
  const pad = 26;
  const d = W.o.r * 2 + pad * 2;
  return (
    <svg width={size} height={size} viewBox={`${W.o.cx - W.o.r - pad} ${-(W.o.cy + W.o.r + pad)} ${d} ${d}`} fill="currentColor" aria-hidden="true">
      <g transform="scale(1,-1)"><O kind={kind} /></g>
    </svg>
  );
}

/**
 * `small`: the top bar of the white pages (the signed-in app and the account pages). The owner asked for the logo there at
 * half its size (2026-11-22): 15px tall, about 104px wide, so the whole word fits even the narrowest phone.
 */
export function Brand({ small = false }: { small?: boolean }) {
  if (small) return <span className="inline-flex items-center text-fg"><Wordmark className="h-[15px] w-auto" /></span>;
  return (
    <span className="inline-flex items-center text-fg">
      <span className="min-[350px]:hidden"><BrandMark size={30} /><span className="sr-only">{SITE.brand}</span></span>
      <Wordmark className="hidden h-[21px] w-auto min-[350px]:block min-[400px]:h-[25px] sm:h-[29px]" />
    </span>
  );
}
