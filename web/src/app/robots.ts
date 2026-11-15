import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/dashboard", "/cases", "/billing", "/admin", "/reset-password"] }],
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
