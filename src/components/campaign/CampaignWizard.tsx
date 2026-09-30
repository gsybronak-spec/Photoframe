"use client";

/**
 * Campaign wizard — the anonymous 3-step user flow (ported from the reference
 * concept, restyled in ZenFrame's cream/glass identity):
 *
 *   Step 1  Input    — name + photo (photo stays in the browser)
 *   Step 2  Adjust   — drag/pinch the photo inside the admin mask, generate
 *   Step 3  Result   — download / share, all client-side
 *
 * The user's photo and the composite NEVER leave the browser; the server only
 * receives anonymous event counters (generate/download/whatsapp/link).
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  Download,
  Flower2,
  ImagePlus,
  MessageCircle,
  Move,
  RefreshCw,
  RotateCcw,
  Share2,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  composeCampaignFrame,
  hasPhotoCutoutTransparency,
  loadImage,
  type CampaignPhotoConfig,
  type CampaignNameConfig,
} from "@/lib/campaign-compositor";

export interface WizardCampaign {
  id: string;
  name: string;
  slug: string;
  district: string | null;
  description: string;
  artworkUrl: string;
  canvas: { width: number; height: number };
  art: { x: number; y: number; width: number; height: number; rotation: number };
  photoConfig: CampaignPhotoConfig | null;
  nameConfig: CampaignNameConfig | null;
}

/** Fire-and-forget anonymous event; never blocks or breaks the UX. */
const subscribeNoop = () => () => {};
function trackEvent(campaignId: string, eventType: string) {
  try {
    void fetch(`/api/campaigns/${campaignId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType }),
    }).catch(() => {});
  } catch {
    /* analytics must never break the wizard */
  }
}

/* ------------------------------------------------------------------ */
/* Step indicator                                                      */
/* ------------------------------------------------------------------ */

function Steps({ step }: { step: number }) {
  const labels = ["Details", "Adjust", "Ready"];
  return (
    <ol className="mb-6 flex items-center justify-center gap-2" aria-label={`Step ${step} of 3`}>
      {labels.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              aria-current={active ? "step" : undefined}
              className={`grid h-7 w-7 place-items-center rounded-full text-xs font-extrabold transition ${
                active
                  ? "bg-gradient-to-r from-saffron to-coral text-white shadow-glass"
                  : done
                    ? "bg-jade/15 text-jade-deep"
                    : "bg-sand text-ink-soft"
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : n}
            </span>
            <span className={`text-xs font-bold ${active ? "text-ink" : "text-ink-soft"}`}>{label}</span>
            {n < 3 && <span aria-hidden className="h-px w-6 bg-shell" />}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Main wizard                                                         */
/* ------------------------------------------------------------------ */

export function CampaignWizard({ campaign }: { campaign: WizardCampaign }) {
  const [step, setStep] = useState(1);
  const [userName, setUserName] = useState("");
  const [, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultDataUrl, setResultDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset for "make another"
  const resetAll = useCallback(() => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setUserName("");
    setPhotoFile(null);
    setPhotoUrl(null);
    setResultUrl(null);
    setResultDataUrl(null);
    setStep(1);
  }, [photoUrl, resultUrl]);

  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickPhoto = (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      window.alert("Please choose an image file (PNG, JPG or WebP).");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      window.alert("That photo is larger than 12 MB — please choose a smaller one.");
      return;
    }
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoFile(file);
    setPhotoUrl(URL.createObjectURL(file));
  };

  const needsPhoto = Boolean(campaign.photoConfig?.enabled);
  const needsName = Boolean(campaign.nameConfig?.enabled);
  const canContinue = (!needsPhoto || Boolean(photoUrl)) && (!needsName || userName.trim().length > 0);

  return (
    <div className="mx-auto w-full max-w-lg">
      <header className="mb-6 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full glass px-3.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-teal">
          <Flower2 className="h-3.5 w-3.5" aria-hidden /> ZenFrame campaign
        </span>
        <h1 className="mt-3 font-display text-3xl font-bold text-ink sm:text-4xl">{campaign.name}</h1>
        {campaign.description && <p className="mt-2 text-sm text-ink-soft">{campaign.description}</p>}
        <p className="mt-2 text-xs text-ink-soft">
          Your photo is edited entirely on your device — it is never uploaded.
        </p>
      </header>

      <Steps step={step} />

      {step === 1 && (
        <StepInput
          campaign={campaign}
          userName={userName}
          onName={setUserName}
          photoUrl={photoUrl}
          needsPhoto={needsPhoto}
          needsName={needsName}
          onPick={pickPhoto}
          onClearPhoto={() => {
            if (photoUrl) URL.revokeObjectURL(photoUrl);
            setPhotoFile(null);
            setPhotoUrl(null);
          }}
          onContinue={() => canContinue && setStep(2)}
          canContinue={canContinue}
        />
      )}

      {step === 2 && photoUrl && (
        <StepAdjust
          campaign={campaign}
          userName={userName}
          photoUrl={photoUrl}
          onBack={() => setStep(1)}
          onGenerated={(dataUrl) => {
            const blob = dataUrlToBlob(dataUrl);
            if (resultUrl) URL.revokeObjectURL(resultUrl);
            setResultUrl(blob ? URL.createObjectURL(blob) : null);
            setResultDataUrl(dataUrl);
            setStep(3);
          }}
        />
      )}

      {step === 3 && (resultUrl || resultDataUrl) && (
        <StepResult
          campaign={campaign}
          userName={userName}
          imageUrl={resultUrl ?? resultDataUrl!}
          fileName={`zenframe-${campaign.slug}.png`}
          copied={copied}
          onMakeAnother={resetAll}
          onCopied={() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          }}
        />
      )}

      <footer className="mt-10 text-center text-[11px] font-medium text-ink-soft">
        <span className="inline-flex items-center gap-1.5">
          <Flower2 className="h-3.5 w-3.5 text-jade" aria-hidden />
          ZenFrame · {campaign.name}
        </span>
      </footer>
    </div>
  );
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const [meta, b64] = dataUrl.split(",");
    const mime = /data:(.*?);/.exec(meta)?.[1] ?? "image/png";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Step 1 — input                                                      */
/* ------------------------------------------------------------------ */

function StepInput({
  campaign,
  userName,
  onName,
  photoUrl,
  needsPhoto,
  needsName,
  onPick,
  onClearPhoto,
  onContinue,
  canContinue,
}: {
  campaign: WizardCampaign;
  userName: string;
  onName: (v: string) => void;
  photoUrl: string | null;
  needsPhoto: boolean;
  needsName: boolean;
  onPick: (file: File | null | undefined) => void;
  onClearPhoto: () => void;
  onContinue: () => void;
  canContinue: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <section className="glass rounded-[2rem] p-6 sm:p-7">
      <div
        className="relative mx-auto mb-5 w-full max-w-[260px] overflow-hidden rounded-2xl border border-shell bg-sand shadow-glass"
        style={{ aspectRatio: `${campaign.canvas.width || 1080} / ${campaign.canvas.height || 1350}` }}
      >
        <div
          className="absolute z-[2]"
          style={{
            left: `${campaign.art.x}%`,
            top: `${campaign.art.y}%`,
            width: `${campaign.art.width}%`,
            height: `${campaign.art.height}%`,
            transform: `rotate(${campaign.art.rotation}deg)`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={campaign.artworkUrl}
            alt={campaign.name}
            className="h-full w-full object-fill"
            draggable={false}
          />
        </div>
        {campaign.photoConfig?.enabled && (
          <div
            className={`pointer-events-none absolute z-[3] flex items-center justify-center overflow-hidden border-2 border-dashed border-gold/80 bg-white/35 backdrop-blur-[1px] ${
              campaign.photoConfig.shape === "circle" ? "rounded-full" : "rounded-xl"
            }`}
            style={{
              left: `${campaign.photoConfig.x}%`,
              top: `${campaign.photoConfig.y}%`,
              width: `${campaign.photoConfig.width}%`,
              height: `${campaign.photoConfig.height}%`,
              transform: `rotate(${campaign.photoConfig.rotation}deg)`,
            }}
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="Preview" className="h-full w-full object-cover" />
            ) : (
              <span className="rounded-full bg-ink/70 px-2.5 py-1 text-[10px] font-bold text-cream">
                Your Photo Here
              </span>
            )}
          </div>
        )}
      </div>

      {campaign.nameConfig?.enabled && (
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">
            Your name {needsName && <span className="text-coral">*</span>}
          </span>
          <input
            value={userName}
            onChange={(e) => onName(e.target.value)}
            maxLength={60}
            placeholder="Type the name to appear on the frame"
            className="mt-1.5 w-full rounded-xl border border-shell bg-white px-4 py-3 text-sm font-medium text-ink placeholder:text-ink-soft/50 focus:border-saffron focus:outline-none"
          />
        </label>
      )}

      {needsPhoto && (
        <div className="mt-4">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">
            Your photo <span className="text-coral">*</span>
          </span>
          {photoUrl ? (
            <div className="relative mt-1.5 overflow-hidden rounded-2xl border border-shell">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl} alt="Your selected photo" className="max-h-64 w-full object-cover" />
              <button
                type="button"
                onClick={onClearPhoto}
                aria-label="Remove photo"
                className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-ink/80 text-cream shadow hover:bg-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                onPick(e.dataTransfer.files?.[0]);
              }}
              className={`mt-1.5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition ${
                dragOver ? "border-saffron bg-saffron/5" : "border-shell bg-white/60 hover:border-saffron/60"
              }`}
            >
              <ImagePlus className="h-7 w-7 text-saffron-deep" aria-hidden />
              <span className="text-sm font-bold text-ink">Tap to add a photo</span>
              <span className="text-xs text-ink-soft">or drag &amp; drop · PNG, JPG, WebP · stays on your device</span>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              onPick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      )}

      <button
        type="button"
        disabled={!canContinue}
        onClick={onContinue}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-saffron to-coral py-3.5 text-sm font-extrabold text-white shadow-glass transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Sparkles className="h-4 w-4" aria-hidden /> Continue to adjust
      </button>
      {!canContinue && (
        <p className="mt-2 text-center text-xs text-ink-soft">
          {needsPhoto && !photoUrl ? "Add a photo to continue." : needsName ? "Enter your name to continue." : ""}
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Step 2 — adjust + generate                                          */
/* ------------------------------------------------------------------ */

function StepAdjust({
  campaign,
  userName,
  photoUrl,
  onBack,
  onGenerated,
}: {
  campaign: WizardCampaign;
  userName: string;
  photoUrl: string;
  onBack: () => void;
  onGenerated: (dataUrl: string) => void;
}) {
  const photo = campaign.photoConfig;
  const name = campaign.nameConfig;
  // React state mirrors the refs only after a gesture ends, so the slider
  // re-renders stay cheap during dragging; refs are the live source of truth.
  const [zoomDisplay, setZoom] = useState(1);
  const [artworkReady, setArtworkReady] = useState(false);
  const [isCutoutArtwork, setIsCutoutArtwork] = useState(false);
  const [artworkError, setArtworkError] = useState("");
  const [photoAspect, setPhotoAspect] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");

  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const maskRef = useRef<HTMLDivElement>(null);
  const panLayerRef = useRef<HTMLDivElement>(null);
  const scaleLayerRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number; w: number; h: number } | null>(null);
  const pinchStart = useRef<{ dist: number; zoom: number } | null>(null);
  const raf = useRef(0);

  useEffect(() => {
    let mounted = true;
    loadImage(campaign.artworkUrl, true)
      .then((img) => {
        if (!mounted) return;
        setArtworkReady(true);
        setIsCutoutArtwork(
          hasPhotoCutoutTransparency(
            img,
            campaign.canvas.width || 1080,
            campaign.canvas.height || 1350,
            campaign.art,
            campaign.photoConfig
          )
        );
      })
      .catch((err: Error) => mounted && setArtworkError(err.message));
    loadImage(photoUrl)
      .then((img) => mounted && setPhotoAspect((img.naturalWidth || 1) / (img.naturalHeight || 1)))
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [campaign.artworkUrl, campaign.art, campaign.canvas.height, campaign.canvas.width, campaign.photoConfig, photoUrl]);

  const applyTransform = useCallback(() => {
    if (panLayerRef.current) {
      panLayerRef.current.style.transform = `translate(${panRef.current.x}%, ${panRef.current.y}%)`;
    }
    if (scaleLayerRef.current) {
      scaleLayerRef.current.style.transform = `translate(-50%, -50%) scale(${zoomRef.current})`;
    }
  }, []);

  const schedule = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(applyTransform);
  }, [applyTransform]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* optional */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = maskRef.current?.getBoundingClientRect();
    if (pointers.current.size === 1) {
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        panX: panRef.current.x,
        panY: panRef.current.y,
        w: rect?.width || 1,
        h: rect?.height || 1,
      };
    } else if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()];
      pinchStart.current = { dist: Math.max(10, Math.hypot(p1.x - p2.x, p1.y - p2.y)), zoom: zoomRef.current };
      dragStart.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    e.preventDefault();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const [p1, p2] = [...pointers.current.values()];
      const ratio = Math.hypot(p1.x - p2.x, p1.y - p2.y) / pinchStart.current.dist;
      zoomRef.current = Math.min(3.5, Math.max(1, pinchStart.current.zoom * ratio));
      schedule();
      return;
    }
    if (pointers.current.size === 1 && dragStart.current) {
      const d = dragStart.current;
      const dx = ((e.clientX - d.x) / d.w) * 100;
      const dy = ((e.clientY - d.y) / d.h) * 100;
      const max = Math.max(80, Math.round(140 * zoomRef.current));
      panRef.current = {
        x: Math.min(max, Math.max(-max, d.panX + dx)),
        y: Math.min(max, Math.max(-max, d.panY + dy)),
      };
      schedule();
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* optional */
    }
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) {
      dragStart.current = null;
      setZoom(Math.round(zoomRef.current * 100) / 100);
    }
  };

  const setZoomValue = (v: number) => {
    zoomRef.current = Math.min(3.5, Math.max(1, v));
    setZoom(zoomRef.current);
    schedule();
  };

  const resetAdjust = () => {
    panRef.current = { x: 0, y: 0 };
    zoomRef.current = 1;
    setZoom(1);
    schedule();
  };

  const canvasW = campaign.canvas.width;
  const canvasH = campaign.canvas.height;
  const maskAspect = photo ? ((photo.width / photo.height) * canvasW) / canvasH : 1;
  const wider = photoAspect > maskAspect;
  const photoWStyle = wider ? `${(photoAspect / maskAspect) * 100}%` : "100%";
  const photoHStyle = wider ? "100%" : `${(maskAspect / photoAspect) * 100}%`;

  const generate = async () => {
    if (artworkError) {
      setGenerateError(artworkError);
      return;
    }
    setGenerating(true);
    setGenerateError("");
    try {
      // Ensure webfonts are ready so canvas text renders with the right face.
      try {
        await document.fonts.ready;
      } catch {
        /* older browsers */
      }
      const dataUrl = await composeCampaignFrame({
        artworkUrl: campaign.artworkUrl,
        canvasWidth: canvasW,
        canvasHeight: canvasH,
        art: campaign.art,
        photoConfig: photo,
        nameConfig: name,
        userName,
        userPhotoUrl: photoUrl,
        photoPan: { ...panRef.current },
        photoZoom: zoomRef.current,
      });
      trackEvent(campaign.id, "generate");
      onGenerated(dataUrl);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Could not generate the frame. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section className="glass rounded-[2rem] p-4 sm:p-6">
      <div className="mb-3 flex items-center justify-between px-1">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs font-bold text-teal hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back
        </button>
        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Step 2 of 3</span>
      </div>

      {artworkError && (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-coral/10 p-3 text-xs font-bold text-coral">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden /> {artworkError}
        </p>
      )}

      <div
        className="relative mx-auto w-full overflow-hidden rounded-2xl border border-shell bg-sand"
        style={{ aspectRatio: `${canvasW} / ${canvasH}`, maxHeight: "62vh" }}
      >
        {/* Artwork layer */}
        <div
          className="absolute z-[2]"
          style={{
            left: `${campaign.art.x}%`,
            top: `${campaign.art.y}%`,
            width: `${campaign.art.width}%`,
            height: `${campaign.art.height}%`,
            transform: `rotate(${campaign.art.rotation}deg)`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={campaign.artworkUrl} alt="" className="h-full w-full object-fill" draggable={false} />
        </div>

        {/* Photo mask layer */}
        {photo?.enabled && (
          <div
            className="absolute z-[5]"
            style={{
              left: `${photo.x}%`,
              top: `${photo.y}%`,
              width: `${photo.width}%`,
              height: `${photo.height}%`,
              transform: `rotate(${photo.rotation}deg)`,
            }}
          >
            <div
              ref={maskRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className={`relative h-full w-full cursor-grab touch-none overflow-hidden border-2 border-dashed border-gold shadow-lg active:cursor-grabbing ${
                photo.shape === "circle" ? "rounded-full" : "rounded-2xl"
              }`}
            >
              <div ref={panLayerRef} className="absolute inset-0" style={{ willChange: "transform" }}>
                <div
                  ref={scaleLayerRef}
                  className="absolute left-1/2 top-1/2"
                  style={{ width: photoWStyle, height: photoHStyle, transform: "translate(-50%, -50%)", willChange: "transform" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl} alt="Your photo" className="h-full w-full select-none object-fill" draggable={false} />
                </div>
              </div>
              <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition hover:opacity-100">
                <span className="flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-bold text-white">
                  <Move className="h-3 w-3" aria-hidden /> Drag to move
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Foreground cutout artwork layer (for PNG frames with transparent photo windows) */}
        {isCutoutArtwork && (
          <div
            className="pointer-events-none absolute z-[6]"
            style={{
              left: `${campaign.art.x}%`,
              top: `${campaign.art.y}%`,
              width: `${campaign.art.width}%`,
              height: `${campaign.art.height}%`,
              transform: `rotate(${campaign.art.rotation}deg)`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={campaign.artworkUrl} alt="" className="h-full w-full object-fill" draggable={false} />
          </div>
        )}

        {/* Name layer */}
        {name?.enabled && (
          <div
            className="pointer-events-none absolute z-[8] flex"
            style={{
              left: `${name.x}%`,
              top: `${name.y}%`,
              width: `${name.width}%`,
              height: `${name.height}%`,
              transform: `rotate(${name.rotation}deg)`,
              alignItems: "center",
              justifyContent: name.alignment === "left" ? "flex-start" : name.alignment === "right" ? "flex-end" : "center",
              padding: "0 4%",
            }}
          >
            <span
              className="w-full truncate"
              style={{
                fontFamily: `"${name.font_family}", sans-serif`,
                fontSize: `${Math.max(10, Math.round(name.font_size * (canvasW / 450)))}px`,
                fontWeight: name.font_weight === "bold" ? 700 : 400,
                color: name.font_color,
                letterSpacing: `${name.letter_spacing}px`,
                textAlign: name.alignment,
                textShadow: "0 2px 8px rgba(0,0,0,0.6)",
              }}
            >
              {userName}
            </span>
          </div>
        )}
      </div>

      {/* Zoom controls */}
      <div className="mt-4 rounded-2xl border border-shell bg-white/70 p-3">
        <div className="flex items-center justify-between text-xs font-bold text-ink-soft">
          <span>
            Photo zoom <span className="font-mono text-teal">{Math.round(zoomDisplay * 100)}%</span>
          </span>
          <button type="button" onClick={resetAdjust} className="inline-flex items-center gap-1 text-coral hover:underline">
            <RotateCcw className="h-3 w-3" aria-hidden /> Reset
          </button>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <button type="button" onClick={() => setZoomValue(zoomRef.current - 0.15)} aria-label="Zoom out" className="grid h-8 w-8 place-items-center rounded-lg border border-shell bg-white text-ink hover:bg-sand">
            <ZoomOut className="h-4 w-4" aria-hidden />
          </button>
          <input
            type="range"
            min={1}
            max={3.5}
            step={0.05}
            value={zoomDisplay}
            onChange={(e) => setZoomValue(parseFloat(e.target.value) || 1)}
            aria-label="Photo zoom"
            className="flex-1 accent-teal"
          />
          <button type="button" onClick={() => setZoomValue(zoomRef.current + 0.15)} aria-label="Zoom in" className="grid h-8 w-8 place-items-center rounded-lg border border-shell bg-white text-ink hover:bg-sand">
            <ZoomIn className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {generateError && <p className="mt-3 text-center text-xs font-bold text-coral">{generateError}</p>}

      <button
        type="button"
        disabled={generating || !artworkReady || Boolean(artworkError)}
        onClick={generate}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-saffron to-coral py-4 text-sm font-extrabold text-white shadow-glass transition active:scale-[0.99] disabled:opacity-60"
      >
        {generating ? (
          <>
            <RefreshCw className="h-5 w-5 animate-spin" aria-hidden /> Compositing your frame…
          </>
        ) : !artworkReady && !artworkError ? (
          <>
            <RefreshCw className="h-5 w-5 animate-spin" aria-hidden /> Loading artwork…
          </>
        ) : (
          <>
            <Sparkles className="h-5 w-5" aria-hidden /> Generate my frame
          </>
        )}
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Step 3 — result                                                     */
/* ------------------------------------------------------------------ */

function StepResult({
  campaign,
  userName,
  imageUrl,
  fileName,
  copied,
  onMakeAnother,
  onCopied,
}: {
  campaign: WizardCampaign;
  userName: string;
  imageUrl: string;
  fileName: string;
  copied: boolean;
  onMakeAnother: () => void;
  onCopied: () => void;
}) {
  const [busy, setBusy] = useState("");
  // SSR-safe "are we on the client" flag without a setState-in-effect.
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );

  const download = () => {
    trackEvent(campaign.id, "download");
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = fileName;
    a.click();
  };

  const shareNative = async () => {
    setBusy("share");
    trackEvent(campaign.id, "link");
    try {
      const blob = imageUrl.startsWith("data:") ? dataUrlToBlob(imageUrl) : null;
      const shareUrl = typeof window !== "undefined" ? window.location.href : "";
      if (blob && navigator.canShare) {
        const file = new File([blob], fileName, { type: blob.type || "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: campaign.name, text: userName ? `${userName} · ${campaign.name}` : campaign.name });
          setBusy("");
          return;
        }
      }
      await navigator.share({ title: campaign.name, text: campaign.name, url: shareUrl });
    } catch {
      /* user cancelled or unsupported */
    }
    setBusy("");
  };

  const shareWhatsApp = () => {
    trackEvent(campaign.id, "whatsapp");
    const text = encodeURIComponent(
      `${userName ? `${userName} — ` : ""}${campaign.name} · Create yours: ${typeof window !== "undefined" ? window.location.href : ""}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener");
  };

  const copyLink = async () => {
    trackEvent(campaign.id, "link");
    try {
      await navigator.clipboard.writeText(window.location.href);
      onCopied();
    } catch {
      /* clipboard blocked */
    }
  };

  const canNativeShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <section className="glass rounded-[2rem] p-6 text-center sm:p-7">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-jade/10 px-3.5 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-jade-deep">
        <Check className="h-3.5 w-3.5" aria-hidden /> Frame ready
      </span>
      <h2 className="mt-3 font-display text-2xl font-bold text-ink">Your frame is ready</h2>
      <p className="mt-1 text-xs text-ink-soft">Made on your device — download it or share it with the world.</p>

      <div className="mx-auto mt-5 max-w-sm overflow-hidden rounded-2xl border border-shell shadow-glass">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={`Your ${campaign.name} frame`} className="w-full" />
      </div>

      <div className="mt-5 grid gap-2">
        <button
          type="button"
          onClick={download}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-saffron to-coral py-3.5 text-sm font-extrabold text-white shadow-glass active:scale-[0.99]"
        >
          <Download className="h-4 w-4" aria-hidden /> Download PNG
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={shareWhatsApp}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-jade/40 bg-jade/5 py-3 text-xs font-extrabold text-jade-deep hover:bg-jade/10"
          >
            <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
          </button>
          <button
            type="button"
            onClick={copyLink}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-shell bg-white py-3 text-xs font-extrabold text-ink hover:bg-sand"
          >
            <Copy className="h-4 w-4" aria-hidden /> {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
        {mounted && canNativeShare && (
          <button
            type="button"
            onClick={shareNative}
            disabled={busy === "share"}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-teal/40 bg-teal/5 py-3 text-xs font-extrabold text-teal hover:bg-teal/10 disabled:opacity-60"
          >
            <Share2 className="h-4 w-4" aria-hidden /> More ways to share
          </button>
        )}
        <button
          type="button"
          onClick={onMakeAnother}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold text-ink-soft hover:text-ink"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Make another one
        </button>
      </div>
    </section>
  );
}
