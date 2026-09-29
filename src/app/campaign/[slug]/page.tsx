import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getActiveCampaignBySlug } from "@/server/campaigns";
import { CampaignWizard, type WizardCampaign } from "@/components/campaign/CampaignWizard";
import { Orbs } from "@/components/Orbs";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zenframe.in";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const campaign = await getActiveCampaignBySlug(slug);
  if (!campaign) return { title: "Campaign not found — ZenFrame", robots: { index: false, follow: false } };

  const title = `${campaign.name} — ZenFrame`;
  const description =
    campaign.description ||
    `Add your photo and name to the “${campaign.name}” frame. Made in seconds, right in your browser.`;

  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/campaign/${campaign.slug}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/campaign/${campaign.slug}`,
      siteName: "ZenFrame",
      type: "website",
      images: campaign.artwork_key ? [{ url: `${SITE_URL}/api/campaigns/${campaign.id}/artwork` }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: campaign.artwork_key ? [`${SITE_URL}/api/campaigns/${campaign.id}/artwork`] : undefined,
    },
  };
}

/**
 * Public campaign page — the anonymous 3-step wizard.
 * Only ACTIVE campaigns resolve here; drafts/paused/archived 404 exactly like
 * the reference implementation, and the server selects strictly by slug so no
 * other campaign data is ever exposed.
 */
export default async function CampaignPage({ params }: Props) {
  const { slug } = await params;
  const campaign = await getActiveCampaignBySlug(slug);
  if (!campaign || !campaign.artwork_key) notFound();

  const wizard: WizardCampaign = {
    id: campaign.id,
    name: campaign.name,
    slug: campaign.slug,
    district: campaign.district,
    description: campaign.description,
    artworkUrl: `/api/campaigns/${campaign.id}/artwork`,
    canvas: { width: campaign.canvas_width, height: campaign.canvas_height },
    art: { x: campaign.art_x, y: campaign.art_y, width: campaign.art_w, height: campaign.art_h, rotation: campaign.art_rotation },
    photoConfig: campaign.photoConfig,
    nameConfig: campaign.nameConfig,
  };

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <Orbs />
      <div className="relative mx-auto w-full max-w-xl px-4 py-8 sm:py-12">
        <CampaignWizard campaign={wizard} />
      </div>
    </main>
  );
}
