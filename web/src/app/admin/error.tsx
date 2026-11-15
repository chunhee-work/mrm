"use client";
import SegmentError from "@/components/segment-error";

// The admin pages draw their own white frame (the Shell in _ui.tsx), which is gone when a page fails: this stands in for it.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="theme-light flex min-h-screen flex-col bg-bay text-fg">
      <SegmentError reset={reset} home="/dashboard" />
    </div>
  );
}
