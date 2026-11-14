import type { Metadata } from "next";
import { getT } from "./i18n-server";

/** Translated tab title for a page. `index: false` keeps account and app pages out of search results. */
export async function pageMeta(key: string, opts: { index?: boolean } = {}): Promise<Metadata> {
  const { t } = await getT();
  return { title: t(key), ...(opts.index === false ? { robots: { index: false, follow: false } } : {}) };
}
