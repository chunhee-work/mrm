"use client";
import SegmentError from "@/components/segment-error";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError reset={reset} home="/dashboard" />;
}
