import { cookies } from "next/headers";
import { normLang, translate, type Lang } from "./i18n";
import { SITE } from "./site";

export async function getLang(): Promise<Lang> {
  return normLang((await cookies()).get("lang")?.value);
}
export async function getT() {
  const lang = await getLang();
  return { lang, t: (k: string, vars?: Record<string, string>) => translate(lang, k, { brand: SITE.brand, ...vars }) };
}
