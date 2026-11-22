"use client";
import { createContext, useContext } from "react";
import { translate, type Lang } from "@/lib/i18n";
import { SITE } from "@/lib/site";

const Ctx = createContext<{ lang: Lang; worker: boolean }>({ lang: "en", worker: false });
export function LangProvider({ lang, worker = false, children }: { lang: Lang; worker?: boolean; children: React.ReactNode }) {
  return <Ctx.Provider value={{ lang, worker }}>{children}</Ctx.Provider>;
}
export function useT() {
  const { lang, worker } = useContext(Ctx);
  return { lang, t: (k: string, vars?: Record<string, string>) => translate(lang, k, { brand: SITE.brand, ...vars }, worker) };
}

/**
 * R5-B03: holds a layout's page inside a client component. On a first visit the page's code can still be loading when
 * React hydrates; React then restarts the nearest component above the page. Restarting a plain element (the form sheet)
 * from the middle of its children threw React #418. This component owns no DOM node, so restarting it is safe.
 */
export function PageSlot({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
