"use client";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { DROPPED_PARAM, holdDropped } from "@/lib/dropped-files";

/**
 * "New case" opens the computer's file picker at once (owner 2026-11-27: no page in between). The picked files take the
 * same road as files dropped on the page: they wait in memory, the new-case page picks them up and sends them by itself,
 * with the same exceptions (a file left out, a zip with several cars, an unreadable zip wait for a press of Upload).
 * Cancelling the picker does nothing.
 */
export default function NewCasePick({ className, testId, children, onPicked }: {
  className: string; testId: string; children: React.ReactNode; onPicked?: () => void;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className} data-testid={testId} onClick={() => input.current?.click()}>{children}</button>
      <input
        ref={input} type="file" multiple accept=".zip,.pdf,image/*" tabIndex={-1} hidden data-testid={`${testId}-input`}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (!files.length) return;
          holdDropped(files);
          onPicked?.();
          router.push(`/cases/new?${DROPPED_PARAM}=1`);
        }}
      />
    </>
  );
}
