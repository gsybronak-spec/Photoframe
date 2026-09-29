import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Orbs } from "@/components/Orbs";
import { AuthProvider } from "@/components/AuthProvider";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zenframe.in";

/** Client-visible auth mode (no secrets): drives which sign-in path the UI uses. */
const AUTH_MODE =
  (process.env.FIREBASE_AUTH_MODE ?? "").trim().toLowerCase() === "firebase"
    ? "firebase"
    : "password";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "ZenFrame — Yoga Photo Frames & Wellness Campaigns",
    template: "%s | ZenFrame",
  },
  description:
    "Create beautiful yoga-themed photo frames and social media wellness campaigns. Upload your photo, pick a hand-crafted frame, download and share your practice in seconds.",
  keywords: [
    "yoga photo frames",
    "yoga day frames",
    "wellness campaigns",
    "meditation frames",
    "social media frames",
    "yoga studio marketing",
    "mindful photo editor",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: "ZenFrame — Yoga Photo Frames & Wellness Campaigns",
    description:
      "Upload your photo, pick a hand-crafted yoga frame, and share your practice with the world.",
    type: "website",
    siteName: "ZenFrame",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "ZenFrame — Yoga Photo Frames & Wellness Campaigns",
    description:
      "Upload your photo, pick a hand-crafted yoga frame, and share your practice.",
  },
  robots: { index: true, follow: true },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#f59e0b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="font-sans">
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__ZENFRAME_AUTH_MODE__=${JSON.stringify(AUTH_MODE)};`,
          }}
        />
        <AuthProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-teal-deep focus:px-5 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white"
          >
            Skip to content
          </a>
          <Orbs />
          <Navbar />
          <main id="main" className="relative z-10">
            {children}
          </main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
