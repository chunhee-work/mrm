"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, UploadArt } from "./marks";

const OK_EXT = /\.(zip|pdf|jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i;
export function accepted(f: File) {
  return f.type.startsWith("image/") || OK_EXT.test(f.name);
}
const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

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
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const cb = useRef(onFiles);
  cb.current = onFiles;

  useEffect(() => {
    if (disabled) { setOver(false); depth.current = 0; return; }
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth.current++; setOver(true); };
    const move = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; };
    const leave = (e: DragEvent) => { if (!hasFiles(e)) return; depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setOver(false); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      cb.current(Array.from(e.dataTransfer?.files ?? []));
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", move);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", move);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [disabled]);

  const pick = () => { if (!disabled) input.current?.click(); };

  return (
    <div
      onClick={(e) => { if (!(e.target as HTMLElement).closest("button")) pick(); }}
      data-over={over}
      className={`app-dash relative transition-colors duration-150 ${over ? "bg-inktint" : "bg-white"} ${
        disabled ? "opacity-55" : "cursor-pointer hover:bg-inktint/60"
      } ${compact ? "flex h-[60px] items-center justify-center" : "flex min-h-[236px] flex-col items-center justify-center px-5 py-8 text-center"}`}
    >
      <input
        ref={input}
        id={inputId}
        type="file"
        multiple
        accept=".zip,.pdf,image/*"
        tabIndex={-1}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => { onFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
      />
      {compact ? (
        <button type="button" onClick={pick} disabled={disabled} className="relative flex h-11 items-center gap-2 px-4 text-[15px] font-semibold text-ink disabled:cursor-not-allowed">
          <Plus />
          {addMore}
        </button>
      ) : (
        <>
          <span className="relative text-ink"><UploadArt lift={over} /></span>
          <p className="display-3 relative mt-4 text-[19px] text-deep [@media(pointer:coarse)]:hidden">{title}</p>
          <p className="relative mt-1.5 text-[15px] text-mute [@media(pointer:coarse)]:mt-4">{hint}</p>
          <button type="button" onClick={pick} disabled={disabled} className="btn-line relative mt-5 !h-11 bg-white !px-5">
            {browse}
          </button>
        </>
      )}
    </div>
  );
}
