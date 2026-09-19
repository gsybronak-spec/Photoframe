"use client";

import { useState } from "react";
import { CheckCircle2, Mail, MapPin, MessageCircle, Send } from "lucide-react";
import { Reveal } from "@/components/Reveal";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", topic: "General", message: "" });
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.includes("@") || form.message.trim().length < 10) {
      setError("Please add your name, a valid email, and a message of at least 10 characters.");
      return;
    }
    setError("");
    setSent(true);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <Reveal className="text-center">
        <h1 className="font-display text-5xl font-semibold text-ink">
          Say <span className="text-gradient">namaste</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-ink-soft">
          Questions, studio partnerships, or a frame idea for your event —
          we read every message between flows.
        </p>
      </Reveal>

      <div className="mt-14 grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* Form */}
        <Reveal>
          <div className="glass rounded-[2rem] p-8 sm:p-10">
            {sent ? (
              <div className="flex flex-col items-center py-10 text-center">
                <span className="grid h-16 w-16 place-items-center rounded-full bg-jade/15 text-jade-deep">
                  <CheckCircle2 className="h-8 w-8" />
                </span>
                <h2 className="mt-5 font-display text-2xl font-semibold text-ink">
                  Message received
                </h2>
                <p className="mt-2 max-w-sm text-ink-soft">
                  Thank you, {form.name.split(" ")[0]}. We&apos;ll reply within
                  one business day. Meanwhile — one deep breath for you. 🌿
                </p>
                <button
                  onClick={() => {
                    setSent(false);
                    setForm({ name: "", email: "", topic: "General", message: "" });
                  }}
                  className="btn-ghost mt-8 rounded-full px-6 py-3 text-sm font-semibold text-ink"
                >
                  Send another
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-ink">
                      Name
                    </span>
                    <input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Your name"
                      className="w-full rounded-2xl border border-white/70 bg-white/60 px-4 py-3.5 text-sm text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-saffron focus:bg-white/80"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-ink">
                      Email
                    </span>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="you@studio.com"
                      className="w-full rounded-2xl border border-white/70 bg-white/60 px-4 py-3.5 text-sm text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-saffron focus:bg-white/80"
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-ink">
                    Topic
                  </span>
                  <select
                    value={form.topic}
                    onChange={(e) => setForm({ ...form, topic: e.target.value })}
                    className="w-full appearance-none rounded-2xl border border-white/70 bg-white/60 px-4 py-3.5 text-sm text-ink outline-none transition focus:border-saffron focus:bg-white/80"
                  >
                    {["General", "Studio partnership", "Frame request", "Support"].map(
                      (t) => (
                        <option key={t}>{t}</option>
                      )
                    )}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-ink">
                    Message
                  </span>
                  <textarea
                    rows={5}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="Tell us what you're planning…"
                    className="w-full resize-none rounded-2xl border border-white/70 bg-white/60 px-4 py-3.5 text-sm text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-saffron focus:bg-white/80"
                  />
                </label>
                {error && (
                  <p className="rounded-2xl bg-coral/10 px-4 py-3 text-sm text-coral">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  className="btn-primary flex items-center justify-center gap-2 rounded-2xl px-8 py-4 font-semibold"
                >
                  Send message <Send className="h-4 w-4" />
                </button>
              </form>
            )}
          </div>
        </Reveal>

        {/* Info cards */}
        <Reveal delay={0.12}>
          <div className="flex h-full flex-col gap-4">
            {[
              {
                icon: Mail,
                title: "Email",
                lines: ["hello@zenframe.in", "Replies within 1 business day"],
              },
              {
                icon: MessageCircle,
                title: "WhatsApp",
                lines: ["+91 90000 12345", "Mon–Sat, 9am–7pm IST"],
              },
              {
                icon: MapPin,
                title: "Shala (HQ)",
                lines: ["Pattom, Trivandrum", "Kerala, India"],
              },
            ].map((c) => (
              <div key={c.title} className="glass flex-1 rounded-3xl p-6">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-jade to-teal text-white shadow-glass">
                  <c.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-display font-semibold text-ink">
                  {c.title}
                </h3>
                {c.lines.map((l) => (
                  <p key={l} className="mt-1 text-sm text-ink-soft">
                    {l}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </div>
  );
}
