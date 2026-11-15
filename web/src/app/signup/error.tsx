"use client";
import SegmentError from "@/components/segment-error";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="px-6 py-8 sm:px-8">
      <SegmentError reset={reset} home="/" />
    </div>
  );
}
