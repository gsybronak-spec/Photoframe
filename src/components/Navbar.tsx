"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import {
  Flower2,
  Menu,
  X,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

const LINKS = [
  { href: "/frames", label: "Frames" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

function subscribeScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

export function Navbar() {
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const scrolled = useSyncExternalStore(
    subscribeScroll,
    () => window.scrollY > 12,
    () => false
  );

  const closeMenu = () => setOpen(false);

  return (
    <header className="sticky top-0 z-50 px-4 pt-4 sm:px-6">
      <nav
        aria-label="Primary"
        className={`mx-auto flex max-w-6xl items-center justify-between rounded-2xl px-4 py-3 transition-all duration-300 sm:px-6 ${
          scrolled ? "glass-strong" : "glass"
        }`}
      >
        <Link href="/" className="flex items-center gap-2.5" aria-label="ZenFrame home">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-saffron to-coral text-white shadow-glass">
            <Flower2 className="h-5 w-5" aria-hidden />
          </span>
          <span className="font-display text-xl font-semibold tracking-tight text-ink">
            Zen<span className="text-gradient">Frame</span>
          </span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname.startsWith(l.href) ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                pathname.startsWith(l.href)
                  ? "bg-teal/10 text-teal"
                  : "text-ink-soft hover:bg-white/60 hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          {loading ? (
            <span
              className="h-9 w-24 animate-pulse rounded-full bg-white/60"
              aria-hidden
            />
          ) : user ? (
            <>
              {user.role === "admin" && (
                <Link
                  href="/admin"
                  className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-gold transition hover:bg-white/70"
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden /> Admin
                </Link>
              )}
              <Link
                href="/dashboard"
                className="relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-teal-deep transition hover:bg-white/70"
              >
                <LayoutDashboard className="h-4 w-4" aria-hidden />
                Dashboard
                {!user.emailVerified && (
                  <span
                    className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-saffron ring-2 ring-white/80"
                    title="Email not verified"
                    aria-label="Email not verified"
                  />
                )}
              </Link>
              <Link
                href="/settings"
                title="Account settings"
                aria-label="Account settings"
                className="grid h-10 w-10 place-items-center rounded-full text-ink-soft transition hover:bg-white/70 hover:text-teal-deep"
              >
                <Settings className="h-4 w-4" aria-hidden />
              </Link>
              <button
                onClick={() => void logout()}
                title={`Sign out ${user.name}`}
                aria-label={`Sign out ${user.name}`}
                className="grid h-10 w-10 place-items-center rounded-full text-ink-soft transition hover:bg-white/70 hover:text-coral"
              >
                <LogOut className="h-4 w-4" aria-hidden />
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full px-4 py-2 text-sm font-semibold text-ink-soft transition hover:text-ink"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="btn-primary rounded-full px-5 py-2.5 text-sm font-semibold"
              >
                Start free
              </Link>
            </>
          )}
        </div>

        <button
          className="grid h-10 w-10 place-items-center rounded-xl text-ink md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
        </button>
      </nav>

      {open && (
        <div id="mobile-menu" className="glass-strong mx-auto mt-2 max-w-6xl rounded-2xl p-4 md:hidden">
          <div className="flex flex-col gap-1">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={closeMenu}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-ink hover:bg-white/70"
              >
                {l.label}
              </Link>
            ))}
            {user ? (
              <>
                {user.role === "admin" && (
                  <Link
                    href="/admin"
                    onClick={closeMenu}
                    className="rounded-xl px-4 py-2.5 text-sm font-medium text-gold hover:bg-white/70"
                  >
                    Admin
                  </Link>
                )}
                <Link
                  href="/dashboard"
                  onClick={closeMenu}
                  className="rounded-xl px-4 py-2.5 text-sm font-medium text-ink hover:bg-white/70"
                >
                  Dashboard
                  {!user.emailVerified && (
                    <span className="ml-2 text-xs font-semibold text-saffron-deep">
                      · verify email
                    </span>
                  )}
                </Link>
                <Link
                  href="/settings"
                  onClick={closeMenu}
                  className="rounded-xl px-4 py-2.5 text-sm font-medium text-ink hover:bg-white/70"
                >
                  Settings &amp; profile
                </Link>
                <button
                  onClick={() => {
                    closeMenu();
                    void logout();
                  }}
                  className="rounded-xl px-4 py-2.5 text-left text-sm font-medium text-coral hover:bg-white/70"
                >
                  Sign out
                </button>
              </>
            ) : (
              <div className="mt-2 flex gap-2">
                <Link
                  href="/login"
                  onClick={closeMenu}
                  className="btn-ghost flex-1 rounded-xl px-4 py-2.5 text-center text-sm font-semibold"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  onClick={closeMenu}
                  className="btn-primary flex-1 rounded-xl px-4 py-2.5 text-center text-sm font-semibold"
                >
                  Start free
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
