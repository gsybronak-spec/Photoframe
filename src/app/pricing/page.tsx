import type { Metadata } from "next";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { PLAN_ORDER, PLANS, isUnlimited } from "@/lib/plans";
import { Reveal } from "@/components/Reveal";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zenframe.in";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "ZenFrame pricing — start free with all 16 hand-crafted yoga frames. Zen Pro and Studio plans for teachers, studios and wellness brands. No credit card required.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Pricing | ZenFrame",
    description:
      "Start free. Upgrade when your community grows. Plans for teachers, studios and wellness brands.",
    url: `${SITE_URL}/pricing`,
    type: "website",
    siteName: "ZenFrame",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing | ZenFrame",
    description: "Free to start — plans for teachers, studios and wellness brands.",
  },
};

const FAQ = [
  {
    q: "Do my photos get uploaded to a server?",
    a: "Your photo is only sent to the server if you explicitly save a creation to your studio — and then it is stored privately, readable only by you. Editing, previewing and downloading all happen in your browser.",
  },
  {
    q: "How many creations and share links do I get?",
    a: `Free includes ${PLANS.free.limits.creations} saved creations and ${PLANS.free.limits.publicShares} public share links. Zen Pro raises that to ${PLANS.pro.limits.creations} and ${PLANS.pro.limits.publicShares}. Studio is unlimited on both.`,
  },
  {
    q: "Can I take a share link down again?",
    a: "Any time. Switch a creation back to private and the public URL stops working immediately — nothing is cached beyond the image request.",
  },
  {
    q: "Can I buy a plan today?",
    a: "Not yet. Billing isn't connected, so no plan can be purchased in-app and nothing will ever be charged. Plan details are shown so the limits are transparent, and they are enforced consistently on the server.",
  },
  {
    q: "Can I delete my account?",
    a: "Yes. Settings → Danger zone deletes your account, creations, images and sessions permanently. You confirm with your password and a typed DELETE.",
  },
];

export default function PricingPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "ZenFrame",
    description: "Yoga photo frames and wellness campaign studio.",
    url: `${SITE_URL}/pricing`,
    brand: { "@type": "Brand", name: "ZenFrame" },
    offers: PLAN_ORDER.map((id) => {
      const plan = PLANS[id];
      const amount = Number(plan.price.replace(/[^0-9.]/g, "")) || 0;
      return {
        "@type": "Offer",
        name: plan.name,
        price: amount,
        priceCurrency: "USD",
        description: plan.blurb,
        url: `${SITE_URL}/pricing`,
      };
    }),
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Reveal className="text-center">
        <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-teal-deep">
          <Sparkles className="h-3.5 w-3.5 text-saffron-deep" aria-hidden />
          Free plan available · no credit card required
        </span>
        <h1 className="mt-5 font-display text-5xl font-semibold text-ink">
          Pricing that <span className="text-gradient">breathes</span> with you
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-ink-soft">
          Start free. Upgrade when your community grows. Every plan includes the full
          editor and browser-private rendering.
        </p>
        <p className="mx-auto mt-4 max-w-xl rounded-2xl bg-white/60 px-5 py-3 text-xs text-ink-soft">
          Billing is not connected in this build — plans can&apos;t be purchased here, and
          no payment details are ever collected. Limits are enforced server-side.
        </p>
      </Reveal>

      <div id="plans" className="mt-14 grid gap-6 lg:grid-cols-3">
        {PLAN_ORDER.map((id, i) => {
          const plan = PLANS[id];
          return (
            <Reveal key={id} delay={i * 0.1}>
              <div
                className={`relative h-full rounded-[2rem] p-[1.5px] ${
                  plan.popular
                    ? "bg-gradient-to-b from-saffron via-coral to-lotus shadow-glow"
                    : "bg-white/60"
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-saffron to-coral px-4 py-1 text-xs font-bold uppercase tracking-wide text-white shadow-glass">
                    Most loved
                  </span>
                )}
                <div className="flex h-full flex-col rounded-[calc(2rem-1.5px)] bg-cream/80 p-8 backdrop-blur-xl">
                  <h2 className="font-display text-xl font-semibold text-teal-deep">
                    {plan.name}
                  </h2>
                  <div className="mt-4 flex items-baseline gap-1.5">
                    <span className="font-display text-5xl font-bold text-ink">
                      {plan.price}
                    </span>
                    <span className="text-sm text-ink-soft">/ {plan.period}</span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-ink-soft">{plan.blurb}</p>

                  <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-2xl bg-white/60 px-3 py-2">
                      <dt className="text-ink-soft">Creations</dt>
                      <dd className="font-bold text-ink">
                        {isUnlimited(plan.limits.creations)
                          ? "Unlimited"
                          : plan.limits.creations}
                      </dd>
                    </div>
                    <div className="rounded-2xl bg-white/60 px-3 py-2">
                      <dt className="text-ink-soft">Public links</dt>
                      <dd className="font-bold text-ink">
                        {isUnlimited(plan.limits.publicShares)
                          ? "Unlimited"
                          : plan.limits.publicShares}
                      </dd>
                    </div>
                  </dl>

                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm text-ink">
                        <span
                          className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                            plan.popular
                              ? "bg-gradient-to-br from-saffron to-coral text-white"
                              : "bg-jade/15 text-jade-deep"
                          }`}
                        >
                          <Check className="h-3 w-3" aria-hidden />
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={plan.href}
                    className={`mt-8 block rounded-2xl py-3.5 text-center font-semibold transition ${
                      plan.popular ? "btn-primary" : "btn-ghost text-ink"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>

      <section className="mx-auto mt-24 max-w-3xl">
        <Reveal className="text-center">
          <h2 className="font-display text-4xl font-semibold text-ink">
            Questions, answered
          </h2>
        </Reveal>
        <div className="mt-10 space-y-3">
          {FAQ.map((f, i) => (
            <Reveal key={f.q} delay={i * 0.06}>
              <details className="glass group overflow-hidden rounded-3xl">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-7 py-5 text-left font-semibold text-ink transition hover:text-coral">
                  {f.q}
                  <span
                    aria-hidden
                    className="text-2xl leading-none text-teal transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="px-7 pb-6 leading-relaxed text-ink-soft">{f.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>
    </div>
  );
}
