import Link from "next/link";
import { Flower2, Heart, Leaf, Sun } from "lucide-react";
import { Reveal } from "@/components/Reveal";

const VALUES = [
  {
    icon: Leaf,
    title: "Ahimsa — do no harm",
    text: "Photos are processed on your device, never parked on a server. Your practice is yours.",
  },
  {
    icon: Sun,
    title: "Surya — bring light",
    text: "Designs that make people feel something: warmth, calm, belonging. Beauty is a feature.",
  },
  {
    icon: Heart,
    title: "Sangha — build community",
    text: "Every frame is an invitation to practice together, from studio challenges to Yoga Day.",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <Reveal className="mx-auto max-w-3xl text-center">
        <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-teal-deep">
          <Flower2 className="h-3.5 w-3.5 text-saffron-deep" /> Our story
        </span>
        <h1 className="mt-5 font-display text-5xl font-semibold leading-tight text-ink">
          Born on the mat, built for the{" "}
          <span className="text-gradient">feed</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">
          ZenFrame started in a small shala in Kochi. Our teacher asked us to
          share one photo of our practice for International Yoga Day — and we
          couldn&apos;t find a single frame that felt like the practice itself:
          warm, grounded, alive. So we made one. Then sixteen. Then a studio
          around them.
        </p>
      </Reveal>

      {/* Stats band */}
      <Reveal delay={0.1}>
        <div className="glass-tint mt-14 grid gap-6 rounded-[2.5rem] p-10 text-center sm:grid-cols-4">
          {[
            ["2025", "Founded in a shala"],
            ["16", "Hand-crafted frames"],
            ["18K+", "Photos framed"],
            ["120+", "Studios on board"],
          ].map(([v, l]) => (
            <div key={l}>
              <p className="font-display text-4xl font-bold text-teal-deep">{v}</p>
              <p className="mt-1 text-sm text-ink-soft">{l}</p>
            </div>
          ))}
        </div>
      </Reveal>

      {/* Values */}
      <div className="mt-20 grid gap-6 md:grid-cols-3">
        {VALUES.map((v, i) => (
          <Reveal key={v.title} delay={i * 0.1}>
            <div className="glass h-full rounded-3xl p-8">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-saffron to-coral p-3 text-white shadow-glass">
                <v.icon className="h-6 w-6" />
              </span>
              <h3 className="mt-5 font-display text-xl font-semibold text-ink">
                {v.title}
              </h3>
              <p className="mt-2 leading-relaxed text-ink-soft">{v.text}</p>
            </div>
          </Reveal>
        ))}
      </div>

      {/* CTA */}
      <Reveal delay={0.15}>
        <div className="glass-dark mt-20 rounded-[2.5rem] p-12 text-center">
          <h2 className="font-display text-3xl font-semibold">
            Practice with us
          </h2>
          <p className="mx-auto mt-3 max-w-md text-cream/85">
            Frame your journey, share your calm, and grow your sangha — one
            beautiful photo at a time.
          </p>
          <Link
            href="/frames"
            className="btn-primary mt-8 inline-block rounded-full px-8 py-4 font-semibold"
          >
            Explore the gallery
          </Link>
        </div>
      </Reveal>
    </div>
  );
}
