import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zenframe.in";

/**
 * Crawling rules.
 * Public pages are open (/frames is public content); account, admin and API
 * surfaces are disallowed. Public share pages (/s/*) stay crawlable on purpose —
 * that is the point of sharing — but each private page also sends its own
 * noindex header as defence in depth.
 */
export default function robots(): MetadataRoute.Robots {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    rules: isProduction
      ? {
          userAgent: "*",
          allow: ["/", "/frames", "/s/"],
          disallow: [
            "/api/",
            "/admin",
            "/dashboard",
            "/settings",
            "/creations/",
            "/verify-email",
            "/reset-password",
            "/forgot-password",
            "/login",
          ],
        }
      : // Preview/dev deployments are never indexed.
        { userAgent: "*", disallow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
