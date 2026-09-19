"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Bookmark,
  Camera,
  Check,
  Copy,
  Download,
  ImagePlus,
  Loader2,
  MailWarning,
  RefreshCw,
  Save,
  Share2,
  ShieldAlert,
  ZoomIn,
} from "lucide-react";
import { buildFrameSVG, type CatalogFrame } from "@/lib/frames";
import { useAuth } from "@/components/AuthProvider";
import { trackClient } from "@/lib/analytics-client";
import {
  ImageError,
  canvasToBlob,
  downloadBlob,
  formatBytes,
  ingestPhotoFile,
  makeThumbDataUrl,
  validateImageFile,
} from "@/lib/image-client";

interface Transform {
  scale: number;
  x: number;
  y: number;
}

const DEFAULT_T: Transform = { scale: 1, x: 0, y: 0 };
const OUT_W = 1000;
const OUT_H = 1250;

type Stage = "empty" | "reading" | "ready" | "rendering" | "saving";

type SaveState =
  | { kind: "idle" }
  | { kind: "saving"; progress: number }
  | { kind: "saved"; id: string; visibility: string }
  | { kind: "error"; message: string; code?: string };

/** JSON POST with real upload progress + cancellation. */
function postWithProgress(
  url: string,
  body: unknown,
  handlers: { onProgress?: (pct: number) => void; onAbort?: () => void }
): { promise: Promise<{ status: number; data: ApiResponse }>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  let aborted = false;

  const promise = new Promise<{ status: number; data: ApiResponse }>(
    (resolve, reject) => {
      xhr.open("POST", url, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && handlers.onProgress) {
          handlers.onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        let data: ApiResponse = { ok: false, error: "Unexpected response" };
        try {
          data = JSON.parse(xhr.responseText) as ApiResponse;
        } catch {
          /* keep the fallback message */
        }
        resolve({ status: xhr.status, data });
      };
      xhr.onerror = () => reject(new Error("network"));
      xhr.ontimeout = () => reject(new Error("timeout"));
      xhr.onabort = () => {
        aborted = true;
        handlers.onAbort?.();
        reject(new Error("aborted"));
      };
      xhr.send(JSON.stringify(body));
    }
  );

  return {
    promise,
    abort: () => {
      if (!aborted) xhr.abort();
    },
  };
}

interface ApiResponse {
  ok: boolean;
  error?: string;
  code?: string;
  creation?: { id: string; visibility: string };
}

export function FrameEditor({ frame }: { frame: CatalogFrame }) {
  const { user } = useAuth();
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoMeta, setPhotoMeta] = useState<{ w: number; h: number; bytes: number } | null>(
    null
  );
  const [caption, setCaption] = useState("");
  const [t, setT] = useState<Transform>(DEFAULT_T);
  const [stage, setStage] = useState<Stage>("empty");
  const [notice, setNotice] = useState<{ tone: "error" | "info"; text: string } | null>(
    null
  );
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [frameSaved, setFrameSaved] = useState<boolean | null>(null);
  const [limitInfo, setLimitInfo] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ px: number; py: number } | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  /* ---------- engagement analytics ---------- */
  useEffect(() => {
    trackClient("editor_open", { frame: frame.slug });
  }, [frame.slug]);

  /* ---------- unsaved-changes guard ---------- */
  const dirty = photo !== null && saveState.kind !== "saved";
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const reset = useCallback(() => {
    setPhoto(null);
    setPhotoMeta(null);
    setCaption("");
    setT(DEFAULT_T);
    setSaveState({ kind: "idle" });
    setStage("empty");
    setNotice(null);
  }, []);

  /* ---------- ingest ---------- */
  const ingest = useCallback(async (file: File) => {
    const problem = validateImageFile(file);
    if (problem) {
      setStage("empty");
      setNotice({ tone: "error", text: problem });
      return;
    }
    setNotice(null);
    setStage("reading");
    try {
      const result = await ingestPhotoFile(file, 1200);
      setPhoto(result.dataUrl);
      setPhotoMeta({ w: result.originalWidth, h: result.originalHeight, bytes: file.size });
      setT(DEFAULT_T);
      setSaveState({ kind: "idle" });
      setStage("ready");
      trackClient("image_upload", {
        frame: frame.slug,
        megapixels: Math.round((result.originalWidth * result.originalHeight) / 10000) / 100,
      });
      if (result.originalWidth * result.originalHeight > 12_000_000) {
        setNotice({
          tone: "info",
          text: `Large photo (${formatBytes(
            file.size
          )}) scaled down for smooth editing — your exported frame is still full quality.`,
        });
      }
    } catch (err) {
      setStage("empty");
      setNotice({
        tone: "error",
        text:
          err instanceof ImageError
            ? err.message
            : "Could not read that image. Try a JPG or PNG.",
      });
    }
  }, [frame.slug]);

  /* ---------- pan & zoom ---------- */
  const onPointerDown = (e: React.PointerEvent) => {
    if (!photo) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.px;
    const dy = e.clientY - dragRef.current.py;
    dragRef.current = { px: e.clientX, py: e.clientY };
    setT((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
  };
  const onPointerUp = () => (dragRef.current = null);

  const onWheel = (e: React.WheelEvent) => {
    if (!photo) return;
    e.preventDefault();
    setT((p) => ({
      ...p,
      scale: Math.min(3, Math.max(0.5, p.scale * (e.deltaY < 0 ? 1.08 : 0.93))),
    }));
  };

  /* ---------- composite on a real canvas (1000×1250) ---------- */
  const renderToCanvas = useCallback(async (): Promise<HTMLCanvasElement> => {
    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageError("Canvas rendering isn't available in this browser.");

    const grad = ctx.createLinearGradient(0, 0, OUT_W, OUT_H);
    grad.addColorStop(0, frame.style.from);
    grad.addColorStop(1, frame.style.to);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, OUT_W, OUT_H);

    if (photo) {
      const img = new Image();
      img.src = photo;
      await img.decode();
      const win = { x: OUT_W * 0.15, y: OUT_H * 0.2, w: OUT_W * 0.7, h: OUT_W * 0.7 };
      const scaleX = win.w / (stageRef.current?.clientWidth ?? win.w);
      const scaleY = win.h / (stageRef.current?.clientHeight ?? win.h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(win.x, win.y, win.w, win.h);
      ctx.clip();
      ctx.translate(win.x + win.w / 2 + t.x * scaleX, win.y + win.h / 2 + t.y * scaleY);
      ctx.scale(t.scale, t.scale);
      ctx.drawImage(img, -win.w / 2, -win.h / 2, win.w, win.h);
      ctx.restore();
    }

    // SVG overlay (art, title, brand, caption) drawn on top at full resolution.
    const overlaySVG = buildFrameSVG(frame, undefined, caption);
    const url = URL.createObjectURL(new Blob([overlaySVG], { type: "image/svg+xml" }));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      ctx.drawImage(img, 0, 0, OUT_W, OUT_H);
    } finally {
      URL.revokeObjectURL(url);
    }
    return canvas;
  }, [frame, photo, caption, t]);

  /* ---------- download ---------- */
  const download = async () => {
    if (busy || !photo) return;
    setBusy(true);
    setStage("rendering");
    setNotice(null);
    try {
      const canvas = await renderToCanvas();
      const blob = await canvasToBlob(canvas, "image/png");
      downloadBlob(blob, `zenframe-${frame.slug}.png`);
      setStage("ready");
    } catch {
      setNotice({
        tone: "error",
        text: "Rendering failed — try re-adding your photo, then download again.",
      });
      setStage("ready");
    } finally {
      setBusy(false);
    }
  };

  /* ---------- web share ---------- */
  const share = async () => {
    if (!photo) return;
    try {
      const canvas = await renderToCanvas();
      const blob = await canvasToBlob(canvas, "image/png");
      const file = new File([blob], `zenframe-${frame.slug}.png`, { type: "image/png" });
      const nav = navigator as Navigator & {
        canShare?: (d: { files: File[] }) => boolean;
      };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({
            files: [file],
            title: frame.title,
            text: caption || frame.tagline,
          });
          return;
        } catch {
          return; // user dismissed the sheet
        }
      }
      await navigator.clipboard.writeText(
        `${window.location.origin}/frames/${frame.slug}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setNotice({ tone: "error", text: "Sharing failed — you can download instead." });
    }
  };

  /* ---------- save to account ---------- */
  const save = async () => {
    if (!photo || saveState.kind === "saving") return;
    setSaveState({ kind: "saving", progress: 0 });
    setNotice(null);
    setStage("saving");

    try {
      // Render first (1000×1250 PNG + a small dashboard thumbnail), then upload
      // with real progress reporting.
      const canvas = await renderToCanvas();
      const imageDataUrl = canvas.toDataURL("image/png");
      const thumbDataUrl = (await makeThumbDataUrl(canvas, 400, 0.72)) ?? "";

      const { promise: upload, abort: cancel } = postWithProgress(
        "/api/creations",
        { frameSlug: frame.slug, caption, imageDataUrl, thumbDataUrl },
        { onProgress: (pct) => setSaveState({ kind: "saving", progress: pct }) }
      );
      abortRef.current = cancel;

      const { status, data } = await upload;
      abortRef.current = null;

      if (!data.ok) {
        setSaveState({
          kind: "error",
          message:
            status === 402
              ? data.error ?? "You've reached your plan limit."
              : data.error ?? "Save failed — please try again.",
          code: data.code,
        });
        setStage("ready");
        return;
      }

      setSaveState({
        kind: "saved",
        id: data.creation!.id,
        visibility: data.creation!.visibility,
      });
      setStage("ready");
    } catch (err) {
      abortRef.current = null;
      setStage("ready");
      if (err instanceof Error && err.message === "aborted") {
        setSaveState({ kind: "idle" });
        setNotice({ tone: "info", text: "Save cancelled — nothing was uploaded." });
        return;
      }
      setSaveState({
        kind: "error",
        message: "Network trouble — check your connection and retry.",
      });
    }
  };

  const cancelSave = () => {
    abortRef.current?.();
    abortRef.current = null;
  };

  const cameraTip = "On mobile this opens your camera. If it doesn't, allow camera access in your browser settings or use Upload instead.";

  const toggleBookmark = async () => {
    try {
      const res = await fetch(`/api/frames/${frame.slug}/favorite`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.ok) setFrameSaved(data.saved);
    } catch {
      /* bookmark is best-effort */
    }
  };

  /* keep the wheel from scrolling the page while zooming */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const stop = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", stop, { passive: false });
    return () => el.removeEventListener("wheel", stop);
  }, []);

  /* prevent losing an upload mid-flight */
  useEffect(() => () => abortRef.current?.(), []);

  const overlayHref = useMemo(
    () =>
      `data:image/svg+xml;utf8,${encodeURIComponent(
        buildFrameSVG(frame, undefined, caption)
      )}`,
    [frame, caption]
  );

  const progressPct =
    stage === "reading"
      ? 35
      : stage === "rendering"
        ? 70
        : saveState.kind === "saving"
          ? 60 + Math.round(saveState.progress * 0.4)
          : 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      {/* ---------------- Stage ---------------- */}
      <div className="glass rounded-[2rem] p-5 sm:p-7">
        <div
          ref={stageRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
          role="application"
          aria-label={`Photo placement stage for the ${frame.title} frame`}
          className={`relative mx-auto aspect-[4/5] w-full max-w-[520px] touch-none select-none overflow-hidden rounded-3xl shadow-glass-lg ${
            photo ? "cursor-grab active:cursor-grabbing" : ""
          }`}
          style={{
            background: `linear-gradient(135deg, ${frame.style.from}, ${frame.style.to})`,
          }}
        >
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt="Your upload"
              draggable={false}
              className="absolute left-[15%] top-[20%] h-[70%] w-[70%] object-cover"
              style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})` }}
            />
          ) : (
            <label
              htmlFor="photo-input"
              className="absolute left-[15%] top-[20%] flex h-[70%] w-[70%] cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-white/80 bg-white/30 text-center backdrop-blur-sm transition hover:bg-white/50"
            >
              {stage === "reading" ? (
                <>
                  <Loader2 className="h-10 w-10 animate-spin text-teal-deep/70" aria-hidden />
                  <span className="text-sm font-semibold text-teal-deep">
                    Preparing your photo…
                  </span>
                </>
              ) : (
                <>
                  <ImagePlus className="h-10 w-10 text-teal-deep/70" aria-hidden />
                  <span className="text-sm font-semibold text-teal-deep">
                    Click to upload your photo
                  </span>
                  <span className="text-xs text-teal-deep/60">
                    JPG, PNG or WebP · up to 25 MB
                  </span>
                </>
              )}
            </label>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={overlayHref}
            alt=""
            aria-hidden
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full"
          />
        </div>

        {/* progress / notice region */}
        {stage !== "empty" && stage !== "ready" && (
          <div className="mt-4" aria-live="polite">
            <div className="flex items-center justify-between text-xs font-semibold text-teal-deep">
              <span className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {stage === "reading"
                  ? "Reading photo"
                  : stage === "rendering"
                    ? "Rendering your frame"
                    : `Saving to your studio${
                        saveState.kind === "saving" ? ` — ${saveState.progress}%` : ""
                      }`}
              </span>
              {stage === "saving" && (
                <button
                  onClick={cancelSave}
                  className="text-xs font-semibold text-coral hover:underline"
                >
                  Cancel
                </button>
              )}
            </div>
            <div
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/70"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-saffron to-coral transition-all"
                style={{ width: `${Math.max(8, progressPct)}%` }}
              />
            </div>
          </div>
        )}

        {notice && (
          <p
            role={notice.tone === "error" ? "alert" : "status"}
            className={`mt-4 flex items-start justify-center gap-2 text-center text-sm ${
              notice.tone === "error" ? "text-coral" : "text-ink-soft"
            }`}
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {notice.text}
          </p>
        )}

        <p className="mt-4 text-center text-xs text-ink-soft">
          {photo
            ? `Drag to reposition · scroll or slider to zoom${
                photoMeta ? ` · original ${photoMeta.w}×${photoMeta.h}` : ""
              }`
            : "Add a photo to begin — editing happens right in your browser"}
        </p>
      </div>

      {/* ---------------- Controls ---------------- */}
      <div className="flex flex-col gap-4">
        <div className="glass rounded-3xl p-6">
          <h3 className="font-display text-lg font-semibold text-ink">Your photo</h3>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={stage === "reading" || stage === "saving"}
              className="btn-ghost flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-ink disabled:opacity-50"
            >
              <ImagePlus className="h-4 w-4" aria-hidden /> Upload
            </button>
            <button
              onClick={() => camRef.current?.click()}
              disabled={stage === "reading" || stage === "saving"}
              title={cameraTip}
              className="btn-ghost flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-ink disabled:opacity-50"
            >
              <Camera className="h-4 w-4" aria-hidden /> Camera
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
            On mobile, Camera opens your device camera. If it doesn&apos;t, allow camera
            access in your browser settings or use Upload.
          </p>
          <input
            id="photo-input"
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // allow re-picking the same file after an error
              if (file) void ingest(file);
            }}
          />
          <input
            ref={camRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void ingest(file);
            }}
          />
          {photo && (
            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-3 text-sm font-medium text-ink">
                <ZoomIn className="h-4 w-4 text-teal" aria-hidden />
                Zoom
                <input
                  type="range"
                  min={0.5}
                  max={3}
                  step={0.01}
                  value={t.scale}
                  aria-label="Zoom level"
                  onChange={(e) => setT((p) => ({ ...p, scale: Number(e.target.value) }))}
                  className="flex-1 accent-coral"
                />
              </label>
              <button
                onClick={reset}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/70 bg-white/40 px-4 py-2.5 text-sm font-semibold text-ink-soft transition hover:bg-white/70 hover:text-ink"
              >
                <RefreshCw className="h-4 w-4" aria-hidden /> Start over
              </button>
            </div>
          )}
        </div>

        <div className="glass rounded-3xl p-6">
          <h3 className="font-display text-lg font-semibold text-ink">
            Intention caption
          </h3>
          <label htmlFor="caption-input" className="sr-only">
            Intention caption shown on your framed photo
          </label>
          <input
            id="caption-input"
            value={caption}
            onChange={(e) => {
              setCaption(e.target.value.slice(0, 48));
              if (saveState.kind !== "saving") setSaveState({ kind: "idle" });
            }}
            placeholder={`e.g. "${frame.tagline}"`}
            maxLength={48}
            className="mt-3 w-full rounded-2xl border border-white/70 bg-white/60 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-saffron focus:bg-white/80"
          />
          <p className="mt-2 text-right text-xs text-ink-soft">{caption.length}/48</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={download}
            disabled={!photo || busy || stage === "saving"}
            className="btn-primary flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-4 w-4" aria-hidden />
            {busy ? "Rendering…" : "Download"}
          </button>
          <button
            onClick={share}
            disabled={!photo || stage === "saving"}
            className="btn-ghost flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold text-ink disabled:opacity-40"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-jade-deep" aria-hidden /> Link copied
              </>
            ) : (
              <>
                <Share2 className="h-4 w-4" aria-hidden /> Share
              </>
            )}
          </button>

          {/* Save-to-account flow */}
          {!user ? (
            <Link
              href={`/login?next=/frames/${frame.slug}`}
              className="btn-ghost col-span-2 flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-ink"
            >
              <Save className="h-4 w-4" aria-hidden /> Sign in to save to your studio
            </Link>
          ) : saveState.kind === "saved" ? (
            <div className="col-span-2 space-y-2">
              <p className="flex items-center justify-center gap-2 rounded-2xl bg-jade/10 px-4 py-3 text-sm font-semibold text-jade-deep">
                <Check className="h-4 w-4" aria-hidden /> Saved — it&apos;s private in your
                studio.
              </p>
              <Link
                href="/dashboard"
                className="btn-ghost flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-ink"
              >
                Open my studio
              </Link>
            </div>
          ) : saveState.kind === "error" ? (
            <div className="col-span-2 space-y-2">
              <p
                role="alert"
                className="flex items-start justify-center gap-2 rounded-2xl bg-coral/10 px-4 py-3 text-center text-sm text-coral"
              >
                {saveState.code === "EMAIL_NOT_VERIFIED" ? (
                  <MailWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                ) : saveState.code === "LIMIT_REACHED" ? (
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                )}
                {saveState.message}
              </p>
              {saveState.code === "EMAIL_NOT_VERIFIED" && (
                <Link
                  href="/verify-email"
                  className="btn-primary flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
                >
                  <MailWarning className="h-4 w-4" aria-hidden /> Verify my email
                </Link>
              )}
              {saveState.code === "LIMIT_REACHED" && (
                <Link
                  href="/dashboard"
                  className="btn-ghost flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-ink"
                >
                  Manage my creations
                </Link>
              )}
              <button
                onClick={save}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-coral/30 px-4 py-3 text-sm font-semibold text-coral transition hover:bg-coral/10"
              >
                <RefreshCw className="h-4 w-4" aria-hidden /> Retry save
              </button>
            </div>
          ) : (
            <button
              onClick={save}
              disabled={!photo || saveState.kind === "saving"}
              className="btn-ghost col-span-2 flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-ink disabled:opacity-40"
            >
              {saveState.kind === "saving" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving{" "}
                  {saveState.progress}%
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" aria-hidden /> Save to my studio
                </>
              )}
            </button>
          )}

          {user && (
            <button
              onClick={toggleBookmark}
              className="btn-ghost col-span-2 flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-ink"
            >
              <Bookmark
                className={`h-4 w-4 ${frameSaved ? "fill-current text-saffron-deep" : ""}`}
                aria-hidden
              />
              {frameSaved ? "Saved to your frames" : "Bookmark this frame"}
            </button>
          )}
          {limitInfo && (
            <p className="col-span-2 text-center text-xs text-ink-soft">{limitInfo}</p>
          )}
        </div>

        <div className="glass-tint flex items-start gap-3 rounded-3xl p-5">
          <Copy className="mt-0.5 h-4 w-4 shrink-0 text-teal-deep" aria-hidden />
          <p className="text-xs leading-relaxed text-teal-deep">
            Editing happens entirely in your browser. Saved creations are stored
            privately in your account — publish a share link only if you want others to
            see one.
          </p>
        </div>

        <button
          onClick={() => {
            setLimitInfo(
              user
                ? "Plan details and limits live in Settings → Plan."
                : "Create a free account to see plan limits."
            );
            trackClient("upgrade_interest", { frame: frame.slug });
          }}
          className="text-center text-xs font-semibold text-ink-soft underline decoration-dotted hover:text-coral"
        >
          How many creations can I save?
        </button>
      </div>
    </div>
  );
}
