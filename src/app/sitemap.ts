import type { MetadataRoute } from "next";
import { getPublicFrames } from "@/server/frame-catalog";
import { activeCampaignSlugs } from "@/server/campaigns";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zenframe.in";

/** Regenerated hourly so admin catalogue changes flow into the sitemap. */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const page = (
    path: string,
    priority: number,
    freq: "daily" | "weekly" | "monthly" = "weekly"
  ) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: freq,
    priority,
  });

  // Only active frames are advertised (inactive ones 404 by design).
  const frames = (await getPublicFrames()).map((f) => page(`/frames/${f.slug}`, 0.8));

  // Only active campaigns are advertised (draft/paused/archived 404 by design).
  const campaigns = (await activeCampaignSlugs()).map((c) =>
    page(`/campaign/${c.slug}`, 0.8)
  );

  return [
    page("/", 1, "daily"),
    page("/frames", 0.9, "daily"),
    ...frames,
    ...campaigns,
    page("/pricing", 0.7, "monthly"),
    page("/about", 0.6, "monthly"),
    page("/contact", 0.5, "monthly"),
    page("/signup", 0.4, "monthly"),
    page("/login", 0.3, "monthly"),
  ];
}
