import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { LEGAL_UPDATED } from "@/lib/legal";

export default function sitemap(): MetadataRoute.Sitemap {
  const legal = new Date(LEGAL_UPDATED);
  return [
    { url: `${SITE.url}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE.url}/contact`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${SITE.url}/signup`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${SITE.url}/privacy`, lastModified: legal, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE.url}/terms`, lastModified: legal, changeFrequency: "yearly", priority: 0.3 },
  ];
}
