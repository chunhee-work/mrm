"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { DROPPED_PARAM, HOLD_MS, holdDropped } from "@/lib/dropped-files";
import { ACCEPT } from "./drop-zone";

/**
 * "New case" opens the computer's file picker at once (owner 2026-11-27: no page in between). The picked files take the
 * same road as files dropped on the page: they wait in memory, the new-case page picks them up and sends them by itself,
 * with the same exceptions (a file left out, a zip with several cars, an unreadable zip wait for a press of Upload).
 * Cancelling the picker does nothing. It stays a link to the empty form: before the page is live, or with Ctrl/Cmd or a
 * middle click, it opens the form as it always did. After a pick it says "Opening…" until the form replaces the page.
 */
export default function NewCasePick({ className, testId, children }: { className: string; testId: string; children: React.ReactNode }) {
  const { t } = useT();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [opening, setOpening] = useState(false);
  // a trip that never ends lets the button work again once the hold has run out
  useEffect(() => { if (!opening) return; const id = window.setTimeout(() => setOpening(false), HOLD_MS); return () => window.clearTimeout(id); }, [opening]);
  return (
    <>
      <Link
        href="/cases/new" className={className} data-testid={testId} data-no-progress="" aria-busy={opening || undefined}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          if (!opening) input.current?.click();
        }}
      >
        {opening ? <span role="status">{t("new.opening")}</span> : children}
      </Link>
      <input
        ref={input} type="file" multiple accept={ACCEPT} tabIndex={-1} aria-hidden="true" className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (!files.length) return;
          holdDropped(files);
          setOpening(true);
          router.push(`/cases/new?${DROPPED_PARAM}=1`);
        }}
      />
    </>
  );
}
