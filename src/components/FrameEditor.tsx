"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Bookmark,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ImagePlus,
  Loader2,
  MailWarning,
  RefreshCw,
  RotateCcw,
  Save,
  Share2,
  ShieldAlert,
  Sliders,
  Sparkles,
  ZoomIn,
} from "lucide-react";
import {
  buildFrameSVG,
  DEFAULT_FRAME_SETTINGS,
  getAllFrames,
  normalizeFrameSettings,
  resolveFrameSlug,
  toCatalogFrame,
  type CatalogFrame,
  type FrameNumericSettings,
} from "@/lib/frames";
import {
  FONT_SIZE_OPTIONS,
  LETTER_SPACING_OPTIONS,
  LINE_HEIGHT_OPTIONS,
  NumberSelect,
  OPACITY_OPTIONS,
  PERCENT_OPTIONS,
  SCALE_OPTIONS,
} from "@/components/ui/NumberSelect";
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
const MAX_SAFE_PNG_DATAURL_CHARS = 3_800_000; // ~2.8 MB binary; above this use high-quality JPEG for mobile reliability

const FRAME_FONTS = [
  "Playfair Display",
  "Plus Jakarta Sans",
  "Cormorant Garamond",
  "Lora",
  "Merriweather",
  "Inter",
  "Georgia",
];

type Stage = "empty" | "reading" | "ready" | "rendering" | "saving";

type SaveState =
  | { kind: "idle" }
  | { kind: "saving"; progress: number }
  | { kind: "saved"; id?: string; visibility?: string; note?: string }
  | { kind: "error"; message: string; code?: string };

/**
 * Mobile-safe image loader.
 * On iOS Safari / Android WebKit, calling `img.decode()` on an SVG `blob:` URL
 * before `onload` throws `DOMException: The source image cannot be decoded`.
 * Waiting for `onload` first and ignoring post-onload decode rejections guarantees
 * canvas drawing succeeds across all mobile and desktop browsers.
 */
function loadDrawableImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = async () => {
      if (typeof img.decode === "function") {
        try {
          await img.decode();
        } catch {
          /* onload already verified the image is decoded and drawable */
        }
      }
      resolve(img);
    };
    img.onerror = () => reject(new Error("Could not decode image layer."));
    img.src = src;
  });
}

/** JSON POST with real upload progress, credentials, timeout, and cancellation. */
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
      xhr.withCredentials = true;
      xhr.timeout = 45_000;
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

export function FrameEditor({
  frame: initialFrame,
  allFrames,
}: {
  frame: CatalogFrame;
  allFrames?: CatalogFrame[];
}) {
  const { user } = useAuth();

  // Merge provided catalog with all 24 code-registered frames so zero frames are ever missing
  const catalogFrames = useMemo<CatalogFrame[]>(() => {
    const bySlug = new Map<string, CatalogFrame>();
    for (const base of getAllFrames()) {
      const cat = toCatalogFrame(base);
      bySlug.set(cat.slug, cat);
    }
    for (const item of allFrames ?? []) {
      const canonical = resolveFrameSlug(item.slug ?? item.id) ?? item.slug;
      if (canonical && bySlug.has(canonical)) {
        const base = bySlug.get(canonical)!;
        bySlug.set(canonical, {
          ...base,
          ...item,
          slug: canonical,
          settings: normalizeFrameSettings(item.settings ?? base.settings),
        });
      }
    }
    const initCanonical = resolveFrameSlug(initialFrame.slug ?? initialFrame.id) ?? initialFrame.slug;
    if (initCanonical && bySlug.has(initCanonical)) {
      bySlug.set(initCanonical, {
        ...bySlug.get(initCanonical)!,
        ...initialFrame,
        slug: initCanonical,
        settings: normalizeFrameSettings(initialFrame.settings),
      });
    }
    return Array.from(bySlug.values());
  }, [allFrames, initialFrame]);

  const [activeSlug, setActiveSlug] = useState<string>(
    () => resolveFrameSlug(initialFrame.slug ?? initialFrame.id) ?? initialFrame.slug
  );

  const activeFrame = useMemo<CatalogFrame>(() => {
    return (
      catalogFrames.find((f) => f.slug === activeSlug) ??
      catalogFrames.find((f) => f.slug === initialFrame.slug) ??
      initialFrame
    );
  }, [catalogFrames, activeSlug, initialFrame]);

  const [frameSettings, setFrameSettings] = useState<FrameNumericSettings>(() => {
    const base = normalizeFrameSettings(initialFrame.settings);
    if (typeof window === "undefined") return base;
    const slug = resolveFrameSlug(initialFrame.slug ?? initialFrame.id) ?? initialFrame.slug;
    const localRaw = window.localStorage.getItem(`zenframe:frameSettings:${slug}`);
    if (localRaw) {
      try {
        return normalizeFrameSettings(JSON.parse(localRaw));
      } catch {
        return base;
      }
    }
    return base;
  });
  const [settingsOpen, setSettingsOpen] = useState<boolean>(true);
  const [settingsState, setSettingsState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [settingsError, setSettingsError] = useState<string>("");

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
  const savingRef = useRef<boolean>(false);

  // Persist current frame selection & sync latest settings from DB API
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("zenframe:selectedFrameSlug", activeFrame.slug);

    let cancelled = false;
    fetch(`/api/frames/${activeFrame.slug}/settings`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.ok || !data?.frame?.settings) return;
        const merged = normalizeFrameSettings(data.frame.settings);
        setFrameSettings(merged);
        window.localStorage.setItem(
          `zenframe:frameSettings:${activeFrame.slug}`,
          JSON.stringify(merged)
        );
      })
      .catch(() => {
        /* fallback to code/local settings */
      });

    return () => {
      cancelled = true;
    };
  }, [activeFrame.slug]);

  const handleSelectFrame = (slugOrId: string) => {
    const canonical = resolveFrameSlug(slugOrId) ?? slugOrId;
    setActiveSlug(canonical);
    const nextFrame = catalogFrames.find((f) => f.slug === canonical);
    if (typeof window !== "undefined") {
      const localRaw = window.localStorage.getItem(`zenframe:frameSettings:${canonical}`);
      if (localRaw) {
        try {
          setFrameSettings(normalizeFrameSettings(JSON.parse(localRaw)));
        } catch {
          setFrameSettings(normalizeFrameSettings(nextFrame?.settings));
        }
      } else {
        setFrameSettings(normalizeFrameSettings(nextFrame?.settings));
      }
    } else {
      setFrameSettings(normalizeFrameSettings(nextFrame?.settings));
    }
    setSettingsState("idle");
    setSettingsError("");
    if (saveState.kind === "saved" || saveState.kind === "error") {
      setSaveState({ kind: "idle" });
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("zenframe:selectedFrameSlug", canonical);
      const url = new URL(window.location.href);
      if (url.pathname.startsWith("/frames/")) {
        url.pathname = `/frames/${canonical}`;
      } else {
        url.searchParams.set("frame", canonical);
      }
      window.history.replaceState({}, "", url.toString());
    }
  };

  const updateSetting = <K extends keyof FrameNumericSettings>(
    key: K,
    val: FrameNumericSettings[K]
  ) => {
    setFrameSettings((prev) => {
      const next = normalizeFrameSettings({ ...prev, [key]: val });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          `zenframe:frameSettings:${activeFrame.slug}`,
          JSON.stringify(next)
        );
      }
      return next;
    });
    if (settingsState === "saved" || settingsState === "error") {
      setSettingsState("idle");
    }
    if (saveState.kind === "saved" || saveState.kind === "error") {
      setSaveState({ kind: "idle" });
    }
  };

  const persistFrameSettings = useCallback(async (): Promise<boolean> => {
    setSettingsState("saving");
    setSettingsError("");
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          `zenframe:frameSettings:${activeFrame.slug}`,
          JSON.stringify(frameSettings)
        );
      }
      const res = await fetch(`/api/frames/${activeFrame.slug}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: frameSettings }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSettingsState("error");
        setSettingsError(data.error ?? "Save failed — please retry.");
        return false;
      }
      if (data.frame?.settings) {
        const synced = normalizeFrameSettings(data.frame.settings);
        setFrameSettings(synced);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            `zenframe:frameSettings:${activeFrame.slug}`,
            JSON.stringify(synced)
          );
        }
      }
      setSettingsState("saved");
      return true;
    } catch {
      setSettingsState("error");
      setSettingsError("Network trouble — check your connection and retry.");
      return false;
    }
  }, [activeFrame.slug, frameSettings]);

  /* ---------- engagement analytics ---------- */
  useEffect(() => {
    trackClient("editor_open", { frame: activeFrame.slug });
  }, [activeFrame.slug]);

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
  const ingest = useCallback(
    async (file: File) => {
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
          frame: activeFrame.slug,
          megapixels:
            Math.round((result.originalWidth * result.originalHeight) / 10000) / 100,
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
    },
    [activeFrame.slug]
  );

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
      scale: Math.round(Math.min(3, Math.max(0.5, p.scale * (e.deltaY < 0 ? 1.08 : 0.93))) * 100) / 100,
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
    grad.addColorStop(0, activeFrame.style.from);
    grad.addColorStop(1, activeFrame.style.to);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, OUT_W, OUT_H);

    if (photo) {
      const img = await loadDrawableImage(photo);
      const win = { x: OUT_W * 0.15, y: OUT_H * 0.2, w: OUT_W * 0.7, h: OUT_W * 0.7 };
      const scaleX = win.w / (stageRef.current?.clientWidth ?? win.w);
      const scaleY = win.h / (stageRef.current?.clientHeight ?? win.h);
      const effectiveScale = t.scale * (frameSettings.photo_scale || 1);
      ctx.save();
      ctx.beginPath();
      ctx.rect(win.x, win.y, win.w, win.h);
      ctx.clip();
      ctx.translate(win.x + win.w / 2 + t.x * scaleX, win.y + win.h / 2 + t.y * scaleY);
      ctx.scale(effectiveScale, effectiveScale);
      ctx.drawImage(img, -win.w / 2, -win.h / 2, win.w, win.h);
      ctx.restore();
    }

    // SVG overlay (art, title, brand, caption, decimal typography) drawn on top at full resolution.
    const overlaySVG = buildFrameSVG(activeFrame, undefined, caption, frameSettings);
    const url = URL.createObjectURL(
      new Blob([overlaySVG], { type: "image/svg+xml;charset=utf-8" })
    );
    try {
      const img = await loadDrawableImage(url);
      ctx.drawImage(img, 0, 0, OUT_W, OUT_H);
    } finally {
      URL.revokeObjectURL(url);
    }
    return canvas;
  }, [activeFrame, photo, caption, t, frameSettings]);

  /* ---------- download ---------- */
  const download = async () => {
    if (busy || !photo) return;
    setBusy(true);
    setStage("rendering");
    setNotice(null);
    try {
      const canvas = await renderToCanvas();
      const blob = await canvasToBlob(canvas, "image/png");
      downloadBlob(blob, `zenframe-${activeFrame.slug}.png`);
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
      const file = new File([blob], `zenframe-${activeFrame.slug}.png`, {
        type: "image/png",
      });
      const nav = navigator as Navigator & {
        canShare?: (d: { files: File[] }) => boolean;
      };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({
            files: [file],
            title: activeFrame.title,
            text: caption || activeFrame.tagline,
          });
          return;
        } catch {
          return; // user dismissed the sheet
        }
      }
      await navigator.clipboard.writeText(
        `${window.location.origin}/frames/${activeFrame.slug}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setNotice({ tone: "error", text: "Sharing failed — you can download instead." });
    }
  };

  /* ---------- unified mobile & desktop save ---------- */
  const save = async () => {
    if (savingRef.current || saveState.kind === "saving") return;
    savingRef.current = true;
    setSaveState({ kind: "saving", progress: 10 });
    setNotice(null);
    if (photo) setStage("saving");

    try {
      // 1. Always persist the frame's numerical/typography settings first
      const settingsOk = await persistFrameSettings();

      // If no photo has been uploaded yet, saving persists the Frame Settings
      if (!photo) {
        savingRef.current = false;
        if (!settingsOk) {
          setSaveState({
            kind: "error",
            message: "Save failed — could not save frame settings.",
          });
          return;
        }
        setSaveState({
          kind: "saved",
          note: "Frame settings saved ✓",
        });
        return;
      }

      // 2. Render composite canvas (mobile WebKit-safe)
      const canvas = await renderToCanvas();

      // If user is not signed in, save frame settings + download the rendered frame directly to their device
      if (!user) {
        const blob = await canvasToBlob(canvas, "image/png");
        downloadBlob(blob, `zenframe-${activeFrame.slug}.png`);
        savingRef.current = false;
        setStage("ready");
        setSaveState({
          kind: "saved",
          note: "Saved to your device & frame settings persisted ✓",
        });
        return;
      }

      // 3. Smart payload encoding for mobile cellular reliability:
      // Use lossless PNG when under ~2.8MB binary; otherwise use high-quality JPEG (0.92)
      // so mobile connections never time out or fail with 413 PAYLOAD_TOO_LARGE.
      let imageDataUrl = canvas.toDataURL("image/png");
      if (imageDataUrl.length > MAX_SAFE_PNG_DATAURL_CHARS) {
        imageDataUrl = canvas.toDataURL("image/jpeg", 0.92);
      }
      const thumbDataUrl = (await makeThumbDataUrl(canvas, 400, 0.72)) ?? "";

      const { promise: upload, abort: cancel } = postWithProgress(
        "/api/creations",
        { frameSlug: activeFrame.slug, caption, imageDataUrl, thumbDataUrl },
        { onProgress: (pct) => setSaveState({ kind: "saving", progress: pct }) }
      );
      abortRef.current = cancel;

      const { status, data } = await upload;
      abortRef.current = null;
      savingRef.current = false;

      if (!data.ok) {
        setSaveState({
          kind: "error",
          message:
            status === 402
              ? data.error ?? "You've reached your plan limit."
              : data.error ?? "Save failed — please retry.",
          code: data.code,
        });
        setStage("ready");
        return;
      }

      setSaveState({
        kind: "saved",
        id: data.creation!.id,
        visibility: data.creation!.visibility,
        note: "Saved ✓ — private in your studio.",
      });
      setStage("ready");
    } catch (err) {
      abortRef.current = null;
      savingRef.current = false;
      if (photo) setStage("ready");
      if (err instanceof Error && err.message === "aborted") {
        setSaveState({ kind: "idle" });
        setNotice({ tone: "info", text: "Save cancelled — nothing was uploaded." });
        return;
      }
      setSaveState({
        kind: "error",
        message:
          err instanceof Error && err.message === "timeout"
            ? "Save timed out on slow network — tap Retry to try again."
            : "Save failed — check your connection and tap Retry.",
      });
    }
  };

  const cancelSave = () => {
    abortRef.current?.();
    abortRef.current = null;
    savingRef.current = false;
  };

  const cameraTip =
    "On mobile this opens your camera. If it doesn't, allow camera access in your browser settings or use Upload instead.";

  const toggleBookmark = async () => {
    try {
      const res = await fetch(`/api/frames/${activeFrame.slug}/favorite`, {
        method: "POST",
      });
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
        buildFrameSVG(activeFrame, undefined, caption, frameSettings)
      )}`,
    [activeFrame, caption, frameSettings]
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
    <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
      {/* ---------------- Stage ---------------- */}
      <div className="glass rounded-[2rem] p-5 sm:p-7">
        {/* Active Frame Selector Bar — Ensures all 24 frames are always accessible */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-900/10 bg-white/70 px-3.5 py-2.5">
          <label
            htmlFor="editor-frame-select"
            className="flex items-center gap-1.5 text-xs font-semibold text-ink"
          >
            <Sparkles className="h-3.5 w-3.5 text-saffron-deep" aria-hidden />
            Frame ({catalogFrames.length}):
          </label>
          <select
            id="editor-frame-select"
            value={activeFrame.slug}
            onChange={(e) => handleSelectFrame(e.target.value)}
            className="min-w-[200px] flex-1 rounded-xl border border-amber-900/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink focus:border-coral focus:outline-none"
          >
            {catalogFrames.map((f, i) => (
              <option key={f.slug} value={f.slug}>
                {i + 1}. {f.title} — {f.category || f.occasion}
              </option>
            ))}
          </select>
        </div>

        <div
          ref={stageRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
          role="application"
          aria-label={`Photo placement stage for the ${activeFrame.title} frame`}
          className={`relative mx-auto aspect-[4/5] w-full max-w-[520px] touch-none select-none overflow-hidden rounded-3xl shadow-glass-lg ${
            photo ? "cursor-grab active:cursor-grabbing" : ""
          }`}
          style={{
            background: `linear-gradient(135deg, ${activeFrame.style.from}, ${activeFrame.style.to})`,
          }}
        >
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt="Your upload"
              draggable={false}
              className="absolute left-[15%] top-[20%] h-[70%] w-[70%] object-cover"
              style={{
                transform: `translate(${t.x}px, ${t.y}px) scale(${
                  t.scale * (frameSettings.photo_scale || 1)
                })`,
              }}
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
                    : `Saving${
                        saveState.kind === "saving" ? ` — ${saveState.progress}%` : "…"
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
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={stage === "reading" || stage === "saving"}
              className="btn-ghost flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-ink disabled:opacity-50"
            >
              <ImagePlus className="h-4 w-4" aria-hidden /> Upload
            </button>
            <button
              type="button"
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
              <NumberSelect
                label="Exact Zoom (Decimal)"
                value={t.scale}
                onChange={(v) => setT((p) => ({ ...p, scale: v }))}
                options={SCALE_OPTIONS}
                min={0.5}
                max={3}
                unit="×"
              />
              <button
                type="button"
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
            placeholder={`e.g. "${activeFrame.tagline}"`}
            maxLength={48}
            className="mt-3 w-full rounded-2xl border border-white/70 bg-white/60 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-saffron focus:bg-white/80"
          />
          <p className="mt-2 text-right text-xs text-ink-soft">{caption.length}/48</p>
        </div>

        {/* Frame Settings (Typography & Numerical Controls with Decimal Support) */}
        <div className="glass rounded-3xl p-5">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setSettingsOpen((p) => !p)}
              aria-expanded={settingsOpen}
              className="flex flex-1 items-center justify-between text-left font-display text-base font-semibold text-ink"
            >
              <span className="flex items-center gap-2">
                <Sliders className="h-4 w-4 text-coral" aria-hidden />
                Frame Settings
              </span>
              <span className="text-xs font-semibold text-teal-deep">
                {settingsOpen ? "Hide" : "Customize"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setFrameSettings({ ...DEFAULT_FRAME_SETTINGS });
                setSettingsState("idle");
              }}
              title="Reset numerical settings to default"
              className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-ink-soft hover:text-ink"
            >
              <RotateCcw className="h-3 w-3" aria-hidden /> Reset
            </button>
          </div>

          {settingsOpen && (
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-ink-soft">
                  Font family
                </span>
                <select
                  value={frameSettings.font_family}
                  onChange={(e) => updateSetting("font_family", e.target.value)}
                  className="w-full rounded-xl border border-amber-900/15 bg-white px-2.5 py-1.5 text-xs font-medium text-ink focus:border-coral focus:outline-none"
                >
                  {FRAME_FONTS.map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <NumberSelect
                  label="Font size"
                  value={frameSettings.font_size}
                  onChange={(v) => updateSetting("font_size", v)}
                  options={FONT_SIZE_OPTIONS}
                  min={6}
                  max={120}
                  unit="px"
                />

                <NumberSelect
                  label="Line height"
                  value={frameSettings.line_height}
                  onChange={(v) => updateSetting("line_height", v)}
                  options={LINE_HEIGHT_OPTIONS}
                  min={0.5}
                  max={4}
                />

                <NumberSelect
                  label="Letter spacing"
                  value={frameSettings.letter_spacing}
                  onChange={(v) => updateSetting("letter_spacing", v)}
                  options={LETTER_SPACING_OPTIONS}
                  min={-5}
                  max={24}
                  unit="px"
                />

                <NumberSelect
                  label="Text scale"
                  value={frameSettings.text_scale}
                  onChange={(v) => updateSetting("text_scale", v)}
                  options={SCALE_OPTIONS}
                  min={0.25}
                  max={3}
                  unit="×"
                />

                <NumberSelect
                  label="Text X"
                  value={frameSettings.text_x}
                  onChange={(v) => updateSetting("text_x", v)}
                  options={PERCENT_OPTIONS}
                  min={0}
                  max={100}
                  unit="%"
                />

                <NumberSelect
                  label="Text Y"
                  value={frameSettings.text_y}
                  onChange={(v) => updateSetting("text_y", v)}
                  options={PERCENT_OPTIONS}
                  min={0}
                  max={100}
                  unit="%"
                />

                <NumberSelect
                  label="Text width"
                  value={frameSettings.text_width}
                  onChange={(v) => updateSetting("text_width", v)}
                  options={PERCENT_OPTIONS}
                  min={10}
                  max={100}
                  unit="%"
                />

                <NumberSelect
                  label="Text opacity"
                  value={frameSettings.text_opacity}
                  onChange={(v) => updateSetting("text_opacity", v)}
                  options={OPACITY_OPTIONS}
                  min={0}
                  max={1}
                />

                <NumberSelect
                  label="Photo scale"
                  value={frameSettings.photo_scale}
                  onChange={(v) => updateSetting("photo_scale", v)}
                  options={SCALE_OPTIONS}
                  min={0.25}
                  max={3}
                  unit="×"
                />

                <NumberSelect
                  label="Border opacity"
                  value={frameSettings.border_opacity}
                  onChange={(v) => updateSetting("border_opacity", v)}
                  options={OPACITY_OPTIONS}
                  min={0}
                  max={1}
                />
              </div>

              {settingsError && (
                <p role="alert" className="text-xs font-semibold text-coral">
                  {settingsError}
                </p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void persistFrameSettings()}
                  disabled={settingsState === "saving"}
                  className="btn-ghost flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-ink disabled:opacity-50"
                >
                  {settingsState === "saving" ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Saving…
                    </>
                  ) : settingsState === "saved" ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-jade-deep" aria-hidden /> Saved ✓
                    </>
                  ) : settingsState === "error" ? (
                    <>
                      <AlertCircle className="h-3.5 w-3.5 text-coral" aria-hidden /> Save failed
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5" aria-hidden /> Save Settings
                    </>
                  )}
                </button>
                {settingsState === "error" && (
                  <button
                    type="button"
                    onClick={() => void persistFrameSettings()}
                    className="rounded-xl border border-coral/30 px-3 py-2 text-xs font-semibold text-coral"
                  >
                    Retry
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={download}
            disabled={!photo || busy || stage === "saving"}
            className="btn-primary flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-4 w-4" aria-hidden />
            {busy ? "Rendering…" : "Download"}
          </button>
          <button
            type="button"
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

          {/* Explicit Save State Machine (Works on mobile & desktop, with or without account) */}
          <div className="col-span-2 space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saveState.kind === "saving"}
                className="btn-primary flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold disabled:opacity-50"
              >
                {saveState.kind === "saving" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving…
                    {saveState.progress > 0 ? ` (${saveState.progress}%)` : ""}
                  </>
                ) : saveState.kind === "saved" ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" aria-hidden /> Saved ✓
                  </>
                ) : saveState.kind === "error" ? (
                  <>
                    <AlertCircle className="h-4 w-4" aria-hidden /> Save failed
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" aria-hidden /> Save
                  </>
                )}
              </button>

              {saveState.kind === "error" && (
                <button
                  type="button"
                  onClick={() => void save()}
                  className="flex items-center justify-center gap-1.5 rounded-2xl border border-coral/40 bg-coral/10 px-4 py-3.5 text-sm font-semibold text-coral transition hover:bg-coral/20"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden /> Retry
                </button>
              )}
            </div>

            {saveState.kind === "saved" && (
              <div className="space-y-2">
                <p
                  role="status"
                  className="flex items-center justify-center gap-2 rounded-2xl bg-jade/10 px-4 py-2.5 text-xs font-semibold text-jade-deep"
                >
                  <Check className="h-4 w-4" aria-hidden />
                  {saveState.note ?? "Saved ✓"}
                </p>
                {user && saveState.id && (
                  <Link
                    href="/dashboard"
                    className="btn-ghost flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-semibold text-ink"
                  >
                    Open my studio
                  </Link>
                )}
              </div>
            )}

            {saveState.kind === "error" && (
              <div className="space-y-2">
                <p
                  role="alert"
                  className="flex items-start justify-center gap-2 rounded-2xl bg-coral/10 px-4 py-2.5 text-center text-xs font-semibold text-coral"
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
                    className="btn-primary flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-semibold"
                  >
                    <MailWarning className="h-4 w-4" aria-hidden /> Verify my email
                  </Link>
                )}
                {saveState.code === "LIMIT_REACHED" && (
                  <Link
                    href="/dashboard"
                    className="btn-ghost flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-semibold text-ink"
                  >
                    Manage my creations
                  </Link>
                )}
              </div>
            )}
          </div>

          {user && (
            <button
              type="button"
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
          type="button"
          onClick={() => {
            setLimitInfo(
              user
                ? "Plan details and limits live in Settings → Plan."
                : "Create a free account to see plan limits."
            );
            trackClient("upgrade_interest", { frame: activeFrame.slug });
          }}
          className="text-center text-xs font-semibold text-ink-soft underline decoration-dotted hover:text-coral"
        >
          How many creations can I save?
        </button>
      </div>
    </div>
  );
}
