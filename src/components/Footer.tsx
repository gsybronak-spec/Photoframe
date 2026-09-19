import Link from "next/link";
import { Flower2, Heart } from "lucide-react";

const COLS = [
  {
    title: "Create",
    links: [
      { href: "/frames", label: "Browse frames" },
      { href: "/frames?occasion=Yoga+Day", label: "Yoga Day frames" },
      { href: "/frames?occasion=Meditation", label: "Meditation frames" },
      { href: "/frames?occasion=Morning+Flow", label: "Morning Flow" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About us" },
      { href: "/pricing", label: "Pricing" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/signup", label: "Create account" },
      { href: "/dashboard", label: "Dashboard" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative z-10 mt-24 px-4 pb-8 sm:px-6">
      <div className="glass mx-auto max-w-6xl rounded-3xl p-8 sm:p-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-saffron to-coral text-white">
                <Flower2 className="h-5 w-5" />
              </span>
              <span className="font-display text-xl font-semibold text-ink">
                Zen<span className="text-gradient">Frame</span>
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-soft">
              Hand-crafted yoga photo frames and wellness campaigns. Breathe,
              upload, share — your practice, beautifully framed.
            </p>
          </div>
          {COLS.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-bold uppercase tracking-widest text-teal">
                {col.title}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-ink-soft transition hover:text-coral"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-white/60 pt-6 text-xs text-ink-soft sm:flex-row">
          <p>© {new Date().getFullYear()} ZenFrame. All rights reserved.</p>
          <p className="flex items-center gap-1.5">
            Made with <Heart className="h-3.5 w-3.5 text-coral" /> for every
            practitioner
          </p>
        </div>
      </div>
    </footer>
  );
}
