import { getLang } from "@/lib/i18n-server";
import { photoT } from "@/lib/photos/strings";

/**
 * Shown the moment the page is asked for, while the case list and the photos are read: the same head as the desk, with the Done button
 * already in its place (grey until the photos are in), so nothing jumps when the real desk arrives.
 */
export default async function Loading() {
  const t = photoT(await getLang());
  return (
    <div className="app-fill flex flex-col" aria-busy="true">
      <div className="shrink-0 pb-2.5 pt-2.5 max-sm:pb-2 max-sm:pt-2">
        <div className="wrap max-sm:px-3">
          <div className="mb-2 h-9 max-sm:h-12 rounded-[4px] bg-panel2/60 motion-safe:animate-pulse" aria-hidden="true" />
          <div className="rounded-[6px] bg-panel shadow-[0_1px_2px_rgba(10,14,19,0.06),0_10px_28px_-14px_rgba(10,14,19,0.22)] ring-1 ring-hair">
            <div className="flex h-[49px] items-center border-b border-hair px-4"><span className="h-8 w-40 rounded-[3px] bg-panel2 motion-safe:animate-pulse" /></div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-1.5 lg:px-5">
              <span className="h-6 w-56 rounded-[3px] bg-panel2 motion-safe:animate-pulse" />
              <div className="max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-40 max-sm:border-t max-sm:border-hair max-sm:bg-panel max-sm:p-2.5 max-sm:pb-[calc(10px+env(safe-area-inset-bottom))] sm:ml-auto">
                <button type="button" disabled data-testid="done-btn-loading" className="flex h-12 items-center justify-center gap-2 rounded-[4px] bg-panel2 px-5 text-[16px] font-bold leading-none text-mute max-sm:h-14 max-sm:w-full">{t("done")}</button>
              </div>
            </div>
            <div className="border-t border-hair px-4 py-3 lg:px-5"><span className="block h-4 w-40 rounded-[3px] bg-panel2 motion-safe:animate-pulse" /></div>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 border-t border-hair">
        <div className="wrap grid grid-cols-2 gap-2 py-3 max-sm:px-3 sm:gap-4 sm:py-4">
          {[0, 1].map((i) => (
            <div key={i} className="overflow-hidden rounded-[3px] border border-hair bg-panel"><div className="aspect-[4/3] bg-panel2 motion-safe:animate-pulse" /><div className="p-3"><div className="h-12 rounded-[3px] bg-panel2 motion-safe:animate-pulse" /></div></div>
          ))}
        </div>
      </div>
    </div>
  );
}
