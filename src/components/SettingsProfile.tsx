"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Camera,
  Check,
  Loader2,
  Mail,
  Save,
  Trash2,
  UserRound,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { VerificationBanner } from "@/components/VerificationBanner";
import { ImageError, ingestPhotoFile, validateImageFile } from "@/lib/image-client";
import { isUnlimited } from "@/lib/plans";

interface Props {
  initial: {
    name: string;
    email: string;
    bio: string;
    studio: string | null;
    avatarUrl: string | null;
    createdAt: string;
    emailVerified: boolean;
  };
  plan: {
    name: string;
    limits: { creations: number; publicShares: number };
    usage: { creations: number; publicShares: number };
  };
}

export function SettingsProfile({ initial, plan }: Props) {
  const router = useRouter();
  const { refresh, user } = useAuth();
  const [name, setName] = useState(initial.name);
  const [bio, setBio] = useState(initial.bio);
  const [studio, setStudio] = useState(initial.studio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty =
    name !== initial.name || bio !== initial.bio || (studio ?? "") !== (initial.studio ?? "");

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("saving");
    setMessage("");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, bio, studio }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setState("error");
        setMessage(data.error ?? "Could not save your profile.");
        return;
      }
      setState("saved");
      setMessage("Profile updated.");
      await refresh();
      router.refresh();
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("error");
      setMessage("Network trouble — check your connection and try again.");
    }
  };

  const uploadAvatar = async (file: File) => {
    const problem = validateImageFile(file, 8 * 1024 * 1024);
    if (problem) {
      setState("error");
      setMessage(problem);
      return;
    }
    setAvatarBusy(true);
    setState("idle");
    try {
      // Avatars are square-cropped and small — nothing big ever leaves the device.
      const { dataUrl } = await ingestPhotoFile(file, 512);
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setState("error");
        setMessage(data.error ?? "Could not upload that image.");
        return;
      }
      setAvatarUrl(data.avatarUrl);
      setState("saved");
      setMessage("Profile photo updated.");
      await refresh();
      router.refresh();
    } catch (err) {
      setState("error");
      setMessage(err instanceof ImageError ? err.message : "Upload failed — try again.");
    } finally {
      setAvatarBusy(false);
    }
  };

  const removeAvatar = async () => {
    setAvatarBusy(true);
    try {
      await fetch("/api/profile/avatar", { method: "DELETE" });
      setAvatarUrl(null);
      await refresh();
      router.refresh();
    } finally {
      setAvatarBusy(false);
    }
  };

  return (
    <section className="glass rounded-[2rem] p-6 sm:p-8" aria-labelledby="profile-heading">
      <h2
        id="profile-heading"
        className="flex items-center gap-2 font-display text-2xl font-semibold text-ink"
      >
        <UserRound className="h-5 w-5 text-teal" aria-hidden /> Profile
      </h2>

      <div className="mt-5">
        <VerificationBanner compact />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-5">
        <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-3xl bg-gradient-to-br from-saffron to-coral font-display text-3xl font-bold text-white shadow-glass">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt="Your profile photo"
              className="h-full w-full object-cover"
            />
          ) : (
            name.charAt(0).toUpperCase() || "Z"
          )}
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={avatarBusy}
            className="btn-ghost flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-50"
          >
            {avatarBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Camera className="h-4 w-4" aria-hidden />
            )}
            {avatarUrl ? "Change photo" : "Upload photo"}
          </button>
          {avatarUrl && (
            <button
              onClick={removeAvatar}
              disabled={avatarBusy}
              className="flex items-center gap-2 rounded-full border border-coral/30 px-4 py-2.5 text-sm font-semibold text-coral transition hover:bg-coral/10 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden /> Remove
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void uploadAvatar(file);
            }}
          />
        </div>
        <p className="text-xs text-ink-soft">
          Square images look best. Avatars are stored privately and shown only to you.
        </p>
      </div>

      <form onSubmit={saveProfile} className="mt-7 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">
              Display name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 60))}
              required
              minLength={2}
              maxLength={60}
              className="w-full rounded-2xl border border-white/70 bg-white/60 px-4 py-3 text-sm text-ink outline-none transition focus:border-saffron focus:bg-white/80"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">
              Studio (optional)
            </span>
            <input
              value={studio}
              onChange={(e) => setStudio(e.target.value.slice(0, 80))}
              maxLength={80}
              placeholder="e.g. Lotus Lane Yoga"
              className="w-full rounded-2xl border border-white/70 bg-white/60 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-saffron focus:bg-white/80"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-ink">Bio</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 280))}
            rows={3}
            maxLength={280}
            placeholder="A line about your practice…"
            className="w-full resize-y rounded-2xl border border-white/70 bg-white/60 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-saffron focus:bg-white/80"
          />
          <span className="mt-1 block text-right text-xs text-ink-soft">
            {bio.length}/280
          </span>
        </label>

        <label className="block">
          <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-ink">
            <Mail className="h-4 w-4 text-ink-soft" aria-hidden /> Email
          </span>
          <input
            value={initial.email}
            readOnly
            disabled
            aria-describedby="email-help"
            className="w-full cursor-not-allowed rounded-2xl border border-white/60 bg-white/40 px-4 py-3 text-sm text-ink-soft"
          />
          <span id="email-help" className="mt-1 block text-xs text-ink-soft">
            {user?.emailVerified
              ? "Verified. Contact support to change the address on your account."
              : "Not verified yet — use the banner above to resend the confirmation email."}
          </span>
        </label>

        {message && (
          <p
            role={state === "error" ? "alert" : "status"}
            className={`flex items-start gap-2 rounded-2xl px-4 py-3 text-sm ${
              state === "error" ? "bg-coral/10 text-coral" : "bg-jade/10 text-jade-deep"
            }`}
          >
            {state === "error" ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            )}
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={state === "saving" || !dirty}
          className="btn-primary flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold disabled:opacity-50"
        >
          {state === "saving" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" aria-hidden /> Save changes
            </>
          )}
        </button>
      </form>

      <div className="mt-8 rounded-3xl bg-white/50 p-5">
        <h3 className="font-display text-lg font-semibold text-ink">Plan</h3>
        <p className="mt-1 text-sm text-ink-soft">
          <span className="font-semibold text-teal-deep">{plan.name}</span> ·{" "}
          {isUnlimited(plan.limits.creations)
            ? "unlimited creations"
            : `${plan.usage.creations} of ${plan.limits.creations} creations`}{" "}
          ·{" "}
          {isUnlimited(plan.limits.publicShares)
            ? "unlimited share links"
            : `${plan.usage.publicShares} of ${plan.limits.publicShares} share links`}
        </p>
        <p className="mt-2 text-xs text-ink-soft">
          Billing isn&apos;t connected yet — plans can&apos;t be purchased or changed in
          the app. Your entitlements are enforced server-side.
        </p>
      </div>
    </section>
  );
}
