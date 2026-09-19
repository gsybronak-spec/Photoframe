import Link from "next/link";
import {
  ArrowRight,
  Download,
  Flame,
  Heart,
  Leaf,
  Move,
  Share2,
  Sparkles,
  Star,
  Sun,
  Upload,
} from "lucide-react";
import { svgToDataURI, buildThumbSVG } from "@/lib/frames";
import { getFeaturedFrames, getSettings } from "@/server/frame-catalog";
import { Reveal } from "@/components/Reveal";
import { FrameCard } from "@/components/FrameCard";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zenframe.in";

/** Statically rendered, refreshed every five minutes so admin edits appear. */
export const revalidate = 300;

const STATS = [
  { value: "18K+", label: "Photos framed" },
  { value: "6", label: "Wellness occasions" },
  { value: "12s", label: "Average create time" },
  { value: "4.9★", label: "Community rating" },
];

const STEPS = [
  {
    icon: Upload,
    title: "Upload Your Photo",
    text: "Choose a photo that matches your practice — or capture one live from your mat.",
  },
  {
    icon: Move,
    title: "Personalize",
    text: "Drag, zoom and settle your photo into a hand-crafted frame. Add an intention line if you like.",
  },
  {
    icon: Download,
    title: "Share It",
    text: "Download in crisp quality and post to your profiles or statuses instantly.",
  },
];

const OCCASION_ART: { occasion: string; from: string; to: string; icon: typeof Sun }[] = [
  { occasion: "Morning Flow", from: "#FFE9C7", to: "#FFD3A3", icon: Sun },
  { occasion: "Yoga Day", from: "#D9F3E3", to: "#B9E8D0", icon: Leaf },
  { occasion: "Meditation", from: "#D7EEF2", to: "#BFE2EA", icon: Heart },
  { occasion: "Sunset Flow", from: "#FFE0D1", to: "#FFC5B5", icon: Flame },
  { occasion: "Breathwork", from: "#DFF5E9", to: "#C4EDD8", icon: Sparkles },
  { occasion: "Mindfulness", from: "#EDE4F7", to: "#DCCEF2", icon: Star },
];

const FEATURES = [
  {
    icon: Sparkles,
    title: "Hand-Crafted Frames",
    text: "Every frame is original vector art — lotus, mandala, chakra and sunrise motifs designed in-house.",
  },
  {
    icon: Move,
    title: "Quick & Easy Customization",
    text: "Drag, zoom, and add an intention caption. A finished, share-ready image in under a minute.",
  },
  {
    icon: Share2,
    title: "Social-Ready Export",
    text: "4:5 portrait output sized perfectly for Instagram, WhatsApp statuses and community groups.",
  },
  {
    icon: Leaf,
    title: "Perfect for Any Occasion",
    text: "International Yoga Day, morning flows, meditation circles, breathwork journeys and more.",
  },
  {
    icon: Heart,
    title: "Made for Studios & Teachers",
    text: "Studios use ZenFrame for challenges, events and promos — no design skills needed.",
  },
  {
    icon: Sun,
    title: "Free to Start",
    text: "Browse and frame for free. No credit card. Upgrade only when your community grows.",
  },
];

const TESTIMONIALS = [
  {
    name: "Ananya R.",
    role: "Vinyasa teacher, Mumbai",
    text: "My Yoga Day challenge frame reached 3,000 shares in a weekend. ZenFrame made our studio look world-class.",
  },
  {
    name: "Marcus T.",
    role: "Breathwork facilitator",
    text: "I put my students' photos in the Breath of Jade frame after every circle. They share them instantly — best retention hack I have.",
  },
  {
    name: "Priya S.",
    role: "Hatha practitioner",
    text: "Uploaded my sunrise pose photo, added an intention, posted to my status. Three people asked what app I used.",
  },
];

export default async function HomePage() {
  const site = await getSettings();
  const trending = await getFeaturedFrames(site.featured_limit);
  const preview = trending.slice(0, 3).map((f) => svgToDataURI(buildThumbSVG(f)));

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "ZenFrame",
      url: SITE_URL,
      description:
        "Create yoga-themed photo frames and wellness campaigns — upload a photo, pick a hand-crafted frame, download and share.",
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "ZenFrame",
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
      description: "Hand-crafted yoga photo frames and wellness campaigns.",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* ---------------- HERO ---------------- */}
      <section className="grid items-center gap-12 pb-20 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:pt-20">
        <Reveal>
          <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-teal-deep">
            <Sparkles className="h-3.5 w-3.5 text-saffron-deep" />
            International Yoga Day frames are live
          </span>
          <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-6xl">
            Find Your Balance,
            <br />
            <span className="text-gradient">Frame by Frame</span>
          </h1>
          <p className="mt-4 font-display text-lg italic text-teal-deep">
            {site.hero_tagline}
          </p>
          <p className="mt-4 max-w-lg text-lg leading-relaxed text-ink-soft">
            ZenFrame turns your practice into art. Pick a hand-crafted yoga
            frame, drop in your photo, and share your calm with the world —
            all in under a minute.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/frames"
              className="btn-primary flex items-center gap-2 rounded-full px-7 py-3.5 font-semibold"
            >
              Start Creating <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="btn-ghost rounded-full px-7 py-3.5 font-semibold text-ink"
            >
              See pricing
            </Link>
          </div>
          <div className="mt-10 grid max-w-md grid-cols-4 gap-3">
            {STATS.map((s) => (
              <div key={s.label} className="glass rounded-2xl px-3 py-4 text-center">
                <p className="font-display text-xl font-bold text-teal-deep">
                  {s.value}
                </p>
                <p className="mt-1 text-[11px] font-medium leading-tight text-ink-soft">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </Reveal>

        {/* Floating frame collage */}
        <Reveal delay={0.15} className="relative hidden lg:block">
          <div className="relative mx-auto h-[560px] w-full max-w-md">
            <div className="glass absolute left-0 top-6 w-52 rotate-[-7deg] rounded-3xl p-2 shadow-glass-lg transition-transform duration-500 hover:rotate-[-3deg] hover:scale-[1.03]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview[0]} alt="Sunrise Salutation frame" className="rounded-2xl" />
            </div>
            <div className="glass absolute right-0 top-0 w-48 rotate-[6deg] rounded-3xl p-2 shadow-glass-lg transition-transform duration-500 hover:rotate-[2deg] hover:scale-[1.03]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview[1]} alt="International Yoga Day frame" className="rounded-2xl" />
            </div>
            <div className="glass absolute bottom-0 left-1/2 w-56 -translate-x-1/2 rotate-[3deg] rounded-3xl p-2 shadow-glass-lg transition-transform duration-500 hover:rotate-0 hover:scale-[1.04]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview[2]} alt="Amber Hour Flow frame" className="rounded-2xl" />
            </div>
            <div className="glass-strong absolute right-4 bottom-24 flex items-center gap-2 rounded-2xl px-4 py-2.5">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-jade" />
              <span className="text-xs font-semibold text-teal-deep">
                132 frames shared today
              </span>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ---------------- STEPS ---------------- */}
      <section className="pb-24">
        <Reveal className="text-center">
          <h2 className="font-display text-4xl font-semibold text-ink">
            Three breaths to a beautiful post
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-soft">
            Upload your photo, pick a frame, and personalize it — all in under
            a minute. No design skills needed.
          </p>
        </Reveal>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.12}>
              <div className="glass sheen relative h-full rounded-3xl p-8">
                <span className="font-display absolute right-6 top-6 text-5xl font-bold text-saffron/25">
                  {i + 1}
                </span>
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-saffron to-coral text-white shadow-glass">
                  <step.icon className="h-6 w-6" />
                </span>
                <h3 className="mt-6 font-display text-xl font-semibold text-ink">
                  {step.title}
                </h3>
                <p className="mt-2 leading-relaxed text-ink-soft">{step.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- OCCASIONS ---------------- */}
      <section className="pb-24">
        <Reveal className="text-center">
          <h2 className="font-display text-4xl font-semibold text-ink">
            Perfect for every practice
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-soft">
            Frames for every occasion your mat takes you.
          </p>
        </Reveal>
        <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {OCCASION_ART.map((o, i) => (
            <Reveal key={o.occasion} delay={i * 0.06}>
              <Link
                href={`/frames?occasion=${encodeURIComponent(o.occasion)}`}
                className="group block rounded-3xl p-[1.5px] transition-transform hover:-translate-y-1"
                style={{
                  background: `linear-gradient(135deg, ${o.from}, ${o.to})`,
                }}
              >
                <div
                  className="glass flex flex-col items-center gap-3 rounded-[calc(1.5rem-1.5px)] px-3 py-7"
                  style={{
                    background: `linear-gradient(135deg, ${o.from}55, ${o.to}55)`,
                  }}
                >
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/70 text-2xl shadow-glass">
                    <o.icon className="h-6 w-6 text-saffron-deep" />
                  </span>
                  <span className="text-sm font-bold text-ink">{o.occasion}</span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- TRENDING FRAMES ---------------- */}
      <section className="pb-24">
        <Reveal className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-4xl font-semibold text-ink">
              Trending this week
            </h2>
            <p className="mt-2 text-ink-soft">
              The frames our community is sharing most right now.
            </p>
          </div>
          <Link
            href="/frames"
            className="btn-ghost hidden items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-ink sm:flex"
          >
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {trending.map((f, i) => (
            <Reveal key={f.id} delay={i * 0.08}>
              <FrameCard frame={f} />
            </Reveal>
          ))}
          {trending.length === 0 && (
            <p className="text-ink-soft">
              No frames are featured right now —{" "}
              <Link href="/frames" className="font-semibold text-coral hover:underline">
                browse the full gallery
              </Link>
              .
            </p>
          )}
        </div>
      </section>

      {/* ---------------- FEATURES ---------------- */}
      <section className="pb-24">
        <div className="glass-tint rounded-[2.5rem] p-8 sm:p-12">
          <Reveal className="text-center">
            <h2 className="font-display text-4xl font-semibold text-ink">
              Everything you need, nothing you don&apos;t
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 0.06}>
                <div className="glass h-full rounded-3xl p-7">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-jade to-teal text-white shadow-glass">
                    <f.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 font-display text-lg font-semibold text-ink">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                    {f.text}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- TESTIMONIALS ---------------- */}
      <section className="pb-24">
        <Reveal className="text-center">
          <h2 className="font-display text-4xl font-semibold text-ink">
            Loved by teachers & practitioners
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.name} delay={i * 0.1}>
              <figure className="glass h-full rounded-3xl p-8">
                <div className="flex gap-1 text-saffron">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star key={s} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <blockquote className="mt-4 leading-relaxed text-ink">
                  “{t.text}”
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-lotus to-coral font-display text-lg font-bold text-white">
                    {t.name[0]}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-ink">{t.name}</p>
                    <p className="text-xs text-ink-soft">{t.role}</p>
                  </div>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="pb-8">
        <Reveal>
          <div className="glass-dark relative overflow-hidden rounded-[2.5rem] px-8 py-16 text-center sm:px-16">
            <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-gold/30 blur-3xl" />
            <div className="absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-coral/30 blur-3xl" />
            <h2 className="relative font-display text-4xl font-semibold sm:text-5xl">
              Start your practice of sharing
            </h2>
            <p className="relative mx-auto mt-4 max-w-xl text-lg text-cream/85">
              Join thousands of yogis framing their journey. Free to start, no
              credit card required.
            </p>
            <div className="relative mt-8 flex flex-wrap justify-center gap-4">
              <Link
                href="/frames"
                className="btn-primary rounded-full px-8 py-4 font-semibold"
              >
                Create your first frame
              </Link>
              <Link
                href="/signup"
                className="rounded-full border border-gold/40 bg-white/10 px-8 py-4 font-semibold text-cream backdrop-blur transition hover:bg-white/20"
              >
                Create free account
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
