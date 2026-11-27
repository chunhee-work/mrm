"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, UploadArt } from "./marks";
import { UPLOAD_EXT } from "@/lib/upload-rules";

/** What the file pickers offer; keep in step with accepted(). */
export const ACCEPT = ".zip,.pdf,image/*";
export function accepted(f: File) {
  return UPLOAD_EXT.test(f.name); // the same list the server enforces (a .gif would be refused there anyway)
}
const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

/**
 * Files dragged anywhere over the window: `over` is true while they hover, `onFiles` gets them on drop.
 * Shared by the new-case drop zone and the first page. Some browsers miss a dragleave (Esc, leaving fast,
 * a node replaced mid-drag), so `over` also resets when no dragover has come for 1 s (browsers repeat it every 350 ± 200 ms).
 */
export function useFileDrag(enabled: boolean, onFiles: (files: File[]) => void) {
  const [over, setOver] = useState(false);
  const cb = useRef(onFiles);
  cb.current = onFiles;
  useEffect(() => {
    if (!enabled) {
      // still catch a file dropped while busy (uploading), or the browser would open it and leave the page
      setOver(false);
      const block = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "none"; };
      window.addEventListener("dragover", block);
      window.addEventListener("drop", block);
      return () => { window.removeEventListener("dragover", block); window.removeEventListener("drop", block); };
    }
    let depth = 0;
    let idle: number | undefined;
    const reset = () => { depth = 0; setOver(false); window.clearTimeout(idle); };
    const ping = () => { window.clearTimeout(idle); idle = window.setTimeout(reset, 1000); };
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; setOver(true); ping(); };
    const move = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; setOver(true); ping(); };
    const leave = (e: DragEvent) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (depth === 0) reset(); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      reset();
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) cb.current(files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", move);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.clearTimeout(idle);
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", move);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [enabled]);
  return over;
}

/**
 * The case-file drop zone. Files can be dropped anywhere on the page (the zone lights up),
 * or picked with the button. Shrinks to a strip once files are chosen.
 */
export default function DropZone({
  inputId, compact, disabled, onFiles, title, hint, browse, addMore,
}: {
  inputId: string;
  compact: boolean;
  disabled: boolean;
  onFiles: (files: File[]) => void;
  title: string;
  hint: string;
  browse: string;
  addMore: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const over = useFileDrag(!disabled, onFiles);

  const pick = () => { if (!disabled) input.current?.click(); };

  return (
    <div
      onClick={(e) => { if (!(e.target as HTMLElement).closest("button")) pick(); }}
      data-over={over}
      className={`app-dash relative transition-colors duration-150 ${over ? "bg-icetint" : "bg-panel"} ${
        disabled ? "opacity-55" : "cursor-pointer hover:bg-icetint/60"
      } ${compact ? "flex h-[60px] items-center justify-center" : "flex min-h-[236px] flex-col items-center justify-center px-5 py-8 text-center"}`}
    >
      <input
        ref={input}
        id={inputId}
        type="file"
        multiple
        accept={ACCEPT}
        tabIndex={-1}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => { onFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
      />
      {compact ? (
        <button type="button" onClick={pick} disabled={disabled} className="relative flex h-11 items-center gap-2 px-4 text-[15px] font-semibold text-ice disabled:cursor-not-allowed">
          <Plus />
          {addMore}
        </button>
      ) : (
        <>
          <span className="relative text-ice"><UploadArt lift={over} /></span>
          <p className="display-3 relative mt-4 text-[19px] text-fg [@media(pointer:coarse)]:hidden">{title}</p>
          <p className="relative mt-1.5 text-[15px] text-mute [@media(pointer:coarse)]:mt-4">{hint}</p>
          <button type="button" onClick={pick} disabled={disabled} className="btn-line relative mt-5 !h-11 bg-panel !px-5">
            {browse}
          </button>
        </>
      )}
    </div>
  );
}
