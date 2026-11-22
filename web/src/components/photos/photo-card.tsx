"use client";
import { memo, useEffect, useRef, useState } from "react";
import { DEFAULT_FILE_TYPE, fileTypeOf } from "@/lib/photos/order-rules";
import { altsOf, isEdited, isFixed, isLow, isNaming, needsName, shownName, type Photo } from "@/lib/photos/desk-rules";
import type { PT } from "@/lib/photos/strings";

export type Editing = { id: number; text: string; hint: string | null; session: string };
export type CardActions = {
  select: (id: number) => void;
  startEdit: (id: number) => void;
  editText: (text: string, picked: boolean) => void;
  commitEdit: (close: boolean, confirmed?: boolean) => void;
  cancelEdit: () => void;
  copy: (id: number) => void;
  paste: (id: number) => void;
  pick: (id: number, name: string) => void;
  restore: (id: number) => void;
  openMove: (id: number) => void;
  dragStart: (id: number) => void;
  dragEnd: () => void;
  dropOn: (id: number) => void;
};

/** Confidence mark on the photo: a number, never colour alone. */
function Mark({ p, t }: { p: Photo; t: PT }) {
  const base = "inline-flex h-6 items-center rounded-[2px] px-2 font-mono text-[11.5px] font-semibold leading-none tracking-wide";
  if (isNaming(p)) return <span className={`${base} bg-bay/85 text-mute motion-safe:animate-pulse`}>{t("namingOne")}</span>;
  if (isEdited(p)) return <span className={`${base} bg-ice text-bay`}>{t("edited")}</span>;
  if (needsName(p)) return <span className={`${base} bg-amber text-bay`}>{p.state === "failed" ? t("failedOne") : "?"}</span>;
  if (isFixed(p)) return <span className={`${base} border border-ice/70 bg-bay/85 uppercase text-ice`}>{t("fixed")}</span>;
  const pct = `${Math.round((p.confidence ?? 0) * 100)}%`;
  return isLow(p)
    ? <span className={`${base} bg-amber text-bay`}>{pct}</span>
    : <span className={`${base} bg-bay/85 text-go`}>{pct}</span>;
}

type Props = {
  p: Photo; n: number; total: number; src: string;
  current: boolean; editing: Editing | null; canDrag: boolean; flash: boolean; hl: boolean;
  a: CardActions; t: PT;
};

function PhotoCardInner({ p, n, total, src, current, editing, canDrag, flash, hl, a, t }: Props) {
  const [over, setOver] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const name = shownName(p);
  const naming = isNaming(p);
  const alts = altsOf(p);
  const warn = needsName(p) || isLow(p);
  const edited = isEdited(p);

  useEffect(() => {
    if (!editing) return;
    const el = input.current;
    if (el && document.activeElement !== el) { el.focus({ preventScroll: true }); el.select(); }
  }, [editing?.session]); // eslint-disable-line react-hooks/exhaustive-deps

  const tone = current ? "border-ice shadow-[0_0_0_1px_theme(colors.ice)]" : warn ? "border-amber/55" : edited ? "border-ice/40" : "border-hair";

  return (
    <article
      data-pid={p.id}
      data-unnamed={needsName(p) ? "1" : undefined}
      aria-current={current ? "true" : undefined}
      onClick={() => a.select(p.id)}
      onDragOver={canDrag ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (!over) setOver(true); } : undefined}
      onDragLeave={canDrag ? () => setOver(false) : undefined}
      onDrop={canDrag ? (e) => { e.preventDefault(); setOver(false); a.dropOn(p.id); } : undefined}
      className={`relative flex min-w-0 flex-col overflow-hidden rounded-[3px] border bg-panel transition-[border-color,box-shadow,opacity] duration-150 [contain-intrinsic-size:auto_420px] [content-visibility:auto] ${tone} ${dragging ? "opacity-40" : ""} ${over ? "outline-dashed outline-2 -outline-offset-2 outline-ice" : ""} ${flash ? "motion-safe:animate-[deskflash_0.9s_ease-out]" : ""} ${hl ? "outline outline-[3px] outline-offset-2 outline-amber motion-safe:animate-[deskpulse_1s_ease-in-out_3]" : ""}`}
    >
      {(warn || edited) && <span aria-hidden="true" className={`absolute inset-y-0 left-0 z-[1] w-[3px] ${warn ? "bg-amber" : "bg-ice"}`} />}

      <div
        className={`relative aspect-[4/3] bg-panel2 ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
        draggable={canDrag}
        title={canDrag ? t("dragHint") : undefined}
        onDragStart={canDrag ? (e) => { e.dataTransfer.setData("text/plain", String(p.id)); e.dataTransfer.effectAllowed = "move"; setDragging(true); a.dragStart(p.id); } : undefined}
        onDragEnd={canDrag ? () => { setDragging(false); a.dragEnd(); } : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src} alt={t("photoAlt", { n, name: name ?? t("noName") })}
          loading="lazy" decoding="async" draggable={false}
          className="h-full w-full select-none object-cover"
        />
        <button
          type="button"
          aria-label={t("move", { n })}
          onClick={(e) => { e.stopPropagation(); a.openMove(p.id); }}
          className="group absolute left-0 top-0 flex h-11 min-w-11 items-start justify-start p-2"
        >
          <span className="inline-flex h-6 items-center rounded-[2px] bg-bay/85 px-2 font-mono text-[11.5px] font-semibold leading-none text-fg transition-colors group-hover:bg-ice group-hover:text-bay">
            {n}<span className="text-mute group-hover:text-bay">/{total}</span>
          </span>
        </button>
        <span className="absolute right-2 top-2"><Mark p={p} t={t} /></span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-2 sm:gap-2.5 sm:p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          {editing ? (
            <div className="col-span-2 min-w-0 sm:col-span-1">
              <input
                ref={input} data-pname
                value={editing.text}
                list="desk-part-names"
                aria-label={t("editName", { n })}
                placeholder={t("namePlaceholder")}
                autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="done" maxLength={120}
                onChange={(e) => {
                  const kind = (e.nativeEvent as InputEvent).inputType;
                  a.editText(e.target.value, kind === undefined || kind === "insertReplacementText");
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") { e.preventDefault(); a.commitEdit(true, true); }
                  else if (e.key === "Escape") { e.preventDefault(); a.cancelEdit(); }
                }}
                onBlur={() => a.commitEdit(true)}
                onClick={(e) => e.stopPropagation()}
                className="min-h-[48px] w-full rounded-[3px] border border-ice bg-bay px-3 text-[16px] font-semibold text-fg outline-none ring-2 ring-ice/20 placeholder:font-normal placeholder:text-mute/60"
              />
              {editing.hint && <p className="mt-1.5 text-[12.5px] leading-snug text-amber">{editing.hint}</p>}
            </div>
          ) : (
            <button
              type="button" data-pname
              aria-label={t("editName", { n })}
              onClick={(e) => { e.stopPropagation(); a.startEdit(p.id); }}
              className={`col-span-2 min-h-[48px] min-w-0 cursor-text rounded-[3px] border border-hair bg-panel2 px-2.5 py-2 text-left text-[15px] font-semibold leading-snug transition-colors duration-150 [overflow-wrap:anywhere] hover:border-ice sm:col-span-1 sm:px-3.5 sm:text-[16px] ${name ? "text-fg" : naming ? "text-mute" : "text-amber"}`}
            >
              {name ?? (naming ? <span className="block h-[10px] w-2/3 rounded-[2px] bg-hair motion-safe:animate-pulse" aria-label={t("namingOne")} /> : t("nameNeeded"))}
            </button>
          )}
          <button
            type="button" disabled={!name}
            onClick={(e) => { e.stopPropagation(); a.copy(p.id); }}
            className="h-11 rounded-[3px] border border-hair px-3 text-[14px] font-semibold text-ice transition-colors duration-150 hover:border-ice active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 sm:h-auto sm:min-h-[48px] sm:px-4"
          >{t("copy")}</button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); a.paste(p.id); }}
            className="h-11 rounded-[3px] border border-hair px-3 text-[14px] font-semibold text-ice transition-colors duration-150 hover:border-ice active:translate-y-px sm:h-auto sm:min-h-[48px] sm:px-4"
          >{t("paste")}</button>
        </div>

        {/* nearly every photo is the same Merimen type: only the odd ones say theirs, the count per type is in the legend */}
        {name && fileTypeOf(name) !== DEFAULT_FILE_TYPE && (
          <p className="truncate font-mono text-[11px] leading-none text-mute" title={`${t("fileType")}: ${fileTypeOf(name)}`} data-testid="file-type">
            {t("fileType")}: {fileTypeOf(name)}
          </p>
        )}

        {(edited || p.srcName) && (
          <div className={`min-h-6 items-center gap-2 ${edited ? "flex" : "hidden sm:flex"}`}>
            {edited && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); a.restore(p.id); }}
                className="inline-flex min-h-[44px] items-center gap-2 text-[13px] font-semibold text-ice underline decoration-hair decoration-1 underline-offset-4 transition-colors hover:decoration-ice sm:min-h-[28px]"
              >{t("restore")}</button>
            )}
            {/* R3-U03: what the model suggested, next to the way back to it */}
            {edited && p.modelName && <span className="min-w-0 truncate text-[12.5px] text-mute" data-testid="was-name">{t("was", { name: p.modelName })}</span>}
            <span className="ml-auto hidden min-w-0 truncate font-mono text-[11.5px] text-mute sm:block">{p.srcName}</span>
          </div>
        )}

        {alts.length > 0 && (
          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center">
            <span className="font-mono text-[11.5px] tracking-wide text-mute">{t("alts")}</span>
            {alts.map((alt, i) => (
              <button
                key={alt} type="button"
                onClick={(e) => { e.stopPropagation(); a.pick(p.id, alt); }}
                className="flex min-h-[40px] items-center gap-2 rounded-[3px] border border-hair px-2.5 py-1.5 text-left text-[13.5px] leading-snug text-fg transition-colors duration-150 [overflow-wrap:anywhere] hover:border-ice hover:text-ice active:translate-y-px sm:min-h-[34px] sm:px-3"
              >
                {current && <kbd className="hidden rounded-[2px] border border-hair px-1 font-mono text-[11px] text-mute lg:inline">{i + 1}</kbd>}
                {alt}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

export const PhotoCard = memo(PhotoCardInner);
