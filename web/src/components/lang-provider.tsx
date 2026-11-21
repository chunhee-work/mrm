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
