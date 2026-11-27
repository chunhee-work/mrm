"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { DROPPED_PARAM, HOLD_MS, holdDropped } from "@/lib/dropped-files";
import { ACCEPT } from "./drop-zone";
import { Plus } from "./marks";

/**
 * "New case" opens the computer's file picker at once (owner 2026-11-27: no page in between, all done on the first page).
 * On the first page (`onPicked`) the picked files go straight to the upload box there. On any other page they wait in memory
 * and the first page picks them up (?dropped=1) and uploads them, with the same exceptions as a drop (a file left out, a zip
 * with several cars, an unreadable zip wait for a press of Upload). Cancelling the picker does nothing. It stays a link to
 * the empty form: before the page is live, or with Ctrl/Cmd or a middle click, it opens the form as it always did. After a
 * pick on another page it says "Opening…" until the first page replaces it.
 */
export default function NewCasePick({ className, testId, children, labelClass = "", onOpening, held = false, onPicked }: { className: string; testId: string; children: React.ReactNode; labelClass?: string; onOpening?: (on: boolean) => void; held?: boolean; onPicked?: (files: File[]) => void }) {
  const { t } = useT();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [opening, setOpening] = useState(false);
  // a trip that never ends lets the button work again once the hold has run out
  useEffect(() => { if (!opening) return; const id = window.setTimeout(() => setOpening(false), HOLD_MS); return () => window.clearTimeout(id); }, [opening]);
  // the page around it (the Cases page) refuses drops while a picked trip is on its way, so a drop cannot replace the pick
  useEffect(() => { onOpening?.(opening); }, [opening, onOpening]);
  return (
    <>
      <Link
        href="/cases/new" className={className} data-testid={testId} data-no-progress="" aria-busy={opening || undefined} aria-disabled={held || undefined}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          if (!opening && !held) input.current?.click(); // held: a drop is already on its way, a pick must not replace it
        }}
      >
        {opening ? <><Plus /><span className={labelClass}>{t("new.opening")}</span></> : children}
      </Link>
      {/* always there, so screen readers hear the change */}
      <span role="status" className="sr-only">{opening ? t("new.opening") : ""}</span>
      <input
        ref={input} type="file" multiple accept={ACCEPT} tabIndex={-1} aria-hidden="true" className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (!files.length) return;
          if (onPicked) { onPicked(files); return; } // on the first page: the upload starts right there
          holdDropped(files);
          setOpening(true);
          router.push(`/dashboard?${DROPPED_PARAM}=1`); // any other page: to the first page, which uploads them
        }}
      />
    </>
  );
}
