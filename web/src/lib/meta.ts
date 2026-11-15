import type { Metadata } from "next";
import { getT } from "./i18n-server";

/**
 * Translated tab title for a page, and (with `desc`) its own description for search results and link previews.
 * `index: false` keeps account and app pages out of search results.
 */
export async function pageMeta(key: string, opts: { index?: boolean; desc?: string } = {}): Promise<Metadata> {
  const { t } = await getT();
  const title = t(key);
  const description = opts.desc ? t(opts.desc) : undefined;
  return {
    title,
    ...(description ? { description, openGraph: { title, description }, twitter: { title, description } } : {}),
    ...(opts.index === false ? { robots: { index: false, follow: false } } : {}),
  };
}
