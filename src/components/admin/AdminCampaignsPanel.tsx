"use client";

/**
 * Admin Campaign Studio — panel, metrics row, campaign list and the direct-
 * manipulation composition editor, ported from the YogFrame concept and
 * restyled in ZenFrame's cream/glass palette.
 *
 * Every mutation goes through role-gated server APIs; this panel is UI only.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle,
  ExternalLink,
  Eye,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import {
  PRESET_CATEGORIES,
  SIZE_PRESETS,
  findMatchingPreset,
  coverFitGeometry,
} from "@/lib/campaign-sizes";
import {
  FONT_SIZE_OPTIONS,
  LETTER_SPACING_OPTIONS,
  LINE_HEIGHT_OPTIONS,
  NumberSelect,
  OPACITY_OPTIONS,
  PERCENT_OPTIONS,
  ROTATION_OPTIONS,
  SCALE_OPTIONS,
} from "@/components/ui/NumberSelect";

/* ------------------------------------------------------------------ */
/* Types (mirror of the API payloads)                                  */
/* ------------------------------------------------------------------ */

export interface CampaignPhotoConfig {
  enabled: boolean;
  shape: "circle" | "square";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface CampaignNameConfig {
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  font_family: string;
  font_size: number;
  font_color: string;
  font_weight: "normal" | "bold";
  alignment: "left" | "center" | "right";
  letter_spacing: number;
  line_height?: number;
  text_scale?: number;
  text_opacity?: number;
}

export interface CampaignDto {
  id: string;
  name: string;
  slug: string;
  district: string | null;
  description: string;
  status: "draft" | "active" | "paused" | "archived";
  hasArtwork: boolean;
  canvas: { width: number; height: number };
  art: { x: number; y: number; width: number; height: number; rotation: number };
  photoConfig: CampaignPhotoConfig | null;
  nameConfig: CampaignNameConfig | null;
  frames: number;
  shares: number;
  createdAt: string;
  updatedAt: string;
}

interface MetricsDto {
  total: number;
  byStatus: { draft: number; active: number; paused: number; archived: number };
  totalFrames: number;
  totalShares: number;
  sharesByType: Record<string, number>;
}

const DEFAULT_PHOTO: CampaignPhotoConfig = {
  enabled: false,
  shape: "square",
  x: 30,
  y: 35,
  width: 40,
  height: 30,
  rotation: 0,
};

const DEFAULT_NAME: CampaignNameConfig = {
  enabled: false,
  x: 20,
  y: 78,
  width: 60,
  height: 12,
  rotation: 0,
  font_family: "Plus Jakarta Sans",
  font_size: 26,
  font_color: "#fff8f0",
  font_weight: "bold",
  alignment: "center",
  letter_spacing: 1,
  line_height: 1.2,
  text_scale: 1,
  text_opacity: 1,
};

const STATUS_STYLES: Record<CampaignDto["status"], string> = {
  draft: "bg-sand text-ink-soft border-shell",
  active: "bg-jade/10 text-jade-deep border-jade/30",
  paused: "bg-gold/10 text-saffron-deep border-gold/30",
  archived: "bg-shell text-ink-soft border-shell",
};

const round1 = (v: number) => Math.round(v * 10) / 10;

/* ------------------------------------------------------------------ */
/* Canvas stage — 8-handle direct manipulation                         */
/* ------------------------------------------------------------------ */

type LayerId = "art" | "photo" | "name";
type Handle = "nw" | "n" | "ne" | "w" | "e" | "sw" | "s" | "se";
const HANDLES: Handle[] = ["nw", "n", "ne", "w", "e", "sw", "s", "se"];

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function CanvasStage({
  campaign,
  artworkUrl,
  photo,
  name,
  activeLayer,
  onSelectLayer,
  onArtRect,
  onPhotoRect,
  onNameRect,
  preview,
  uploading,
  onPickFile,
}: {
  campaign: CampaignDto;
  artworkUrl: string | null;
  photo: CampaignPhotoConfig;
  name: CampaignNameConfig;
  activeLayer: LayerId;
  onSelectLayer: (l: LayerId) => void;
  onArtRect: (r: Partial<Rect> & { rotation?: number }) => void;
  onPhotoRect: (r: Partial<Rect> & { rotation?: number }) => void;
  onNameRect: (r: Partial<Rect> & { rotation?: number }) => void;
  preview: boolean;
  uploading: boolean;
  onPickFile: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    layer: LayerId;
    handle: Handle | "move";
    startX: number;
    startY: number;
    initial: Rect;
    stageW: number;
    stageH: number;
  } | null>(null);

  const rects: Record<LayerId, Rect & { rotation: number }> = {
    art: { ...campaign.art, rotation: campaign.art.rotation },
    photo: { x: photo.x, y: photo.y, width: photo.width, height: photo.height, rotation: photo.rotation },
    name: { x: name.x, y: name.y, width: name.width, height: name.height, rotation: name.rotation },
  };

  const onPointerDown = (e: React.PointerEvent, layer: LayerId, handle: Handle | "move") => {
    if (preview) return;
    e.stopPropagation();
    e.preventDefault();
    onSelectLayer(layer);
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    drag.current = {
      layer,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      initial: { ...rects[layer] },
      stageW: rect.width || 1,
      stageH: rect.height || 1,
    };
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      e.preventDefault();
      const dx = ((e.clientX - d.startX) / d.stageW) * 100;
      const dy = ((e.clientY - d.startY) / d.stageH) * 100;
      const min = 4;
      const next = { ...d.initial };
      if (d.handle === "move") {
        next.x = round1(Math.min(100, Math.max(0, d.initial.x + dx)));
        next.y = round1(Math.min(100, Math.max(0, d.initial.y + dy)));
      } else {
        if (d.handle.includes("w")) {
          const w = d.initial.width - dx;
          if (w >= min) {
            next.x = round1(d.initial.x + dx);
            next.width = round1(w);
          }
        }
        if (d.handle.includes("e")) {
          const w = d.initial.width + dx;
          if (w >= min) next.width = round1(w);
        }
        if (d.handle.includes("n")) {
          const h = d.initial.height - dy;
          if (h >= min) {
            next.y = round1(d.initial.y + dy);
            next.height = round1(h);
          }
        }
        if (d.handle.includes("s")) {
          const h = d.initial.height + dy;
          if (h >= min) next.height = round1(h);
        }
      }
      const patch = { x: next.x, y: next.y, width: next.width, height: next.height };
      if (d.layer === "art") onArtRect(patch);
      else if (d.layer === "photo") onPhotoRect(patch);
      else onNameRect(patch);
    };
    const up = () => {
      drag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [onArtRect, onPhotoRect, onNameRect]);

  const W = campaign.canvas.width;
  const H = campaign.canvas.height;

  return (
    <div className="w-full">
      <div
        ref={stageRef}
        className="relative mx-auto w-full overflow-hidden rounded-2xl border border-shell bg-[repeating-conic-gradient(#f1e8d8_0%_25%,#faf6ed_0%_50%)] bg-[length:24px_24px]"
        style={{ aspectRatio: `${W} / ${H}`, maxHeight: "72vh" }}
        onClick={(e) => {
          if (e.target === stageRef.current) onSelectLayer("art");
        }}
      >
        {/* Layer 1 — artwork base */}
        <div
          className={`absolute ${activeLayer === "art" && !preview ? "ring-2 ring-teal" : ""}`}
          style={{
            left: `${rects.art.x}%`,
            top: `${rects.art.y}%`,
            width: `${rects.art.width}%`,
            height: `${rects.art.height}%`,
            transform: `rotate(${rects.art.rotation}deg)`,
          }}
          onPointerDown={(e) => onPointerDown(e, "art", "move")}
        >
          {artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={artworkUrl} alt="Campaign artwork" className="h-full w-full select-none object-fill" draggable={false} />
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPickFile();
              }}
              className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gold/50 bg-cream/90 text-center transition hover:border-saffron"
            >
              <Upload className="h-6 w-6 text-saffron-deep" />
              <span className="font-display text-sm font-bold text-ink">Upload campaign artwork</span>
              <span className="text-xs text-ink-soft">PNG, JPG or WebP — becomes the base layer</span>
            </button>
          )}
          {!preview && activeLayer === "art" && artworkUrl && (
            <div aria-hidden className="absolute inset-0">
              {HANDLES.map((h) => (
                <span
                  key={h}
                  data-handle={h}
                  onPointerDown={(e) => onPointerDown(e, "art", h)}
                  className="absolute h-3 w-3 rounded-full border-2 border-white bg-teal shadow"
                  style={{
                    left: h.includes("w") ? -6 : h.includes("e") ? "calc(100% - 6px)" : "calc(50% - 6px)",
                    top: h.includes("n") ? -6 : h.includes("s") ? "calc(100% - 6px)" : "calc(50% - 6px)",
                    cursor: `${h}-resize`,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Layer 2 — photo mask */}
        {photo.enabled && (
          <div
            className={`absolute ${activeLayer === "photo" && !preview ? "ring-2 ring-saffron" : ""}`}
            style={{
              left: `${rects.photo.x}%`,
              top: `${rects.photo.y}%`,
              width: `${rects.photo.width}%`,
              height: `${rects.photo.height}%`,
              transform: `rotate(${rects.photo.rotation}deg)`,
            }}
            onPointerDown={(e) => onPointerDown(e, "photo", "move")}
          >
            <div
              className={`flex h-full w-full items-center justify-center border-2 border-dashed border-gold bg-cream/40 ${
                photo.shape === "circle" ? "rounded-full" : "rounded-2xl"
              }`}
            >
              <span className="flex items-center gap-1 rounded-full bg-cream/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink shadow">
                <UserRound className="h-3 w-3" /> Photo area
              </span>
            </div>
            {!preview && activeLayer === "photo" && (
              <div aria-hidden className="absolute inset-0">
                {HANDLES.map((h) => (
                  <span
                    key={h}
                    onPointerDown={(e) => onPointerDown(e, "photo", h)}
                    className="absolute h-3 w-3 rounded-full border-2 border-white bg-saffron shadow"
                    style={{
                      left: h.includes("w") ? -6 : h.includes("e") ? "calc(100% - 6px)" : "calc(50% - 6px)",
                      top: h.includes("n") ? -6 : h.includes("s") ? "calc(100% - 6px)" : "calc(50% - 6px)",
                      cursor: `${h}-resize`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Layer 3 — name overlay */}
        {name.enabled && (
          <div
            className={`absolute flex ${activeLayer === "name" && !preview ? "ring-2 ring-lotus" : ""}`}
            style={{
              left: `${rects.name.x}%`,
              top: `${rects.name.y}%`,
              width: `${rects.name.width}%`,
              height: `${rects.name.height}%`,
              transform: `rotate(${rects.name.rotation}deg)`,
              alignItems: "center",
              justifyContent: name.alignment === "left" ? "flex-start" : name.alignment === "right" ? "flex-end" : "center",
              padding: "0 4%",
            }}
            onPointerDown={(e) => onPointerDown(e, "name", "move")}
          >
            <span
              className="w-full truncate"
              style={{
                fontFamily: `"${name.font_family}", sans-serif`,
                fontSize: `${Math.max(8, Math.round(name.font_size * (name.text_scale ?? 1) * (W / 450) * 100) / 100)}px`,
                lineHeight: name.line_height ?? 1.2,
                opacity: name.text_opacity ?? 1,
                fontWeight: name.font_weight === "bold" ? 700 : 400,
                color: name.font_color,
                letterSpacing: `${name.letter_spacing}px`,
                textAlign: name.alignment,
                textShadow: "0 2px 8px rgba(0,0,0,0.6)",
              }}
            >
              Your Name
            </span>
            {!preview && activeLayer === "name" && (
              <div aria-hidden className="absolute inset-0">
                {HANDLES.map((h) => (
                  <span
                    key={h}
                    onPointerDown={(e) => onPointerDown(e, "name", h)}
                    className="absolute h-3 w-3 rounded-full border-2 border-white bg-lotus shadow"
                    style={{
                      left: h.includes("w") ? -6 : h.includes("e") ? "calc(100% - 6px)" : "calc(50% - 6px)",
                      top: h.includes("n") ? -6 : h.includes("s") ? "calc(100% - 6px)" : "calc(50% - 6px)",
                      cursor: `${h}-resize`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {uploading && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-cream/70 backdrop-blur-sm">
            <Loader2 className="h-6 w-6 animate-spin text-teal" />
          </div>
        )}
      </div>
      <p className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-ink-soft">
        <span>Click a layer to select · drag to move · drag the handles to stretch.</span>
        <button
          type="button"
          className="font-bold text-teal hover:underline"
          onClick={() => onArtRect({ x: 0, y: 0, width: 100, height: 100, rotation: 0 })}
        >
          Fit artwork (100%)
        </button>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Numeric field (Dropdown + Custom Decimal Input via NumberSelect)    */
/* ------------------------------------------------------------------ */

function NumField({
  label,
  value,
  min,
  max,
  step = "any",
  options,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number | "any";
  options?: readonly number[];
  unit?: string;
  onChange: (v: number) => void;
}) {
  const lower = label.toLowerCase();
  const resolvedOptions =
    options ??
    (lower.includes("font size")
      ? FONT_SIZE_OPTIONS
      : lower.includes("letter")
        ? LETTER_SPACING_OPTIONS
        : lower.includes("line height")
          ? LINE_HEIGHT_OPTIONS
          : lower.includes("scale")
            ? SCALE_OPTIONS
            : lower.includes("opacity")
              ? OPACITY_OPTIONS
              : lower.includes("rotation")
                ? ROTATION_OPTIONS
                : PERCENT_OPTIONS);

  return (
    <NumberSelect
      label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      unit={unit}
      options={resolvedOptions}
      onChange={onChange}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Main panel                                                          */
/* ------------------------------------------------------------------ */

export function AdminCampaignsPanel() {
  const [metrics, setMetrics] = useState<MetricsDto | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignDto[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 12, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  // Editor state
  const [editing, setEditing] = useState<CampaignDto | null>(null);
  const [photo, setPhoto] = useState<CampaignPhotoConfig>(DEFAULT_PHOTO);
  const [name, setName] = useState<CampaignNameConfig>(DEFAULT_NAME);
  const [activeLayer, setActiveLayer] = useState<LayerId>("art");
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2800);
  }, []);

  const load = useCallback(
    async (overrides?: { page?: number; status?: string; search?: string }) => {
      setLoading(true);
      setError("");
      try {
        const p = overrides?.page ?? page;
        const s = overrides?.status ?? statusFilter;
        const q = overrides?.search ?? search;
        const params = new URLSearchParams({ page: String(p), limit: "12" });
        if (s !== "all") params.set("status", s);
        if (q.trim()) params.set("search", q.trim());
        const [listRes, metricsRes] = await Promise.all([
          fetch(`/api/admin/campaigns?${params.toString()}`),
          fetch("/api/admin/campaigns/metrics"),
        ]);
        if (listRes.status === 401 || metricsRes.status === 401) throw new Error("Session expired — sign in again.");
        const list = await listRes.json();
        const m = await metricsRes.json();
        if (!list.ok) throw new Error(list.error || "Failed to load campaigns");
        if (m.ok) setMetrics(m.metrics);
        setCampaigns(list.campaigns ?? []);
        setDistricts(list.districts ?? []);
        if (list.pagination) setPagination(list.pagination);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load campaigns");
      } finally {
        setLoading(false);
      }
    },
    [page, statusFilter, search]
  );

  useEffect(() => {
    // Data loading on mount/dep change: the fetch is awaited before any state
    // update, so this cannot cause a cascading synchronous render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const loadIntoEditor = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/campaigns/${id}`);
    const data = await res.json();
    if (!data.ok) {
      showToast(data.error || "Failed to load campaign");
      return;
    }
    const c = data.campaign as CampaignDto & {
      artwork_key?: string | null;
      photoConfig: CampaignPhotoConfig | null;
      nameConfig: CampaignNameConfig | null;
    };
    setEditing({ ...c, hasArtwork: Boolean(c.artwork_key ?? c.hasArtwork) });
    setPhoto(c.photoConfig ?? { ...DEFAULT_PHOTO });
    setName(c.nameConfig ?? { ...DEFAULT_NAME });
    setActiveLayer("art");
    setSaveMsg(null);
    document.getElementById("campaign-studio")?.scrollIntoView({ behavior: "smooth" });
  }, [showToast]);

  const newCampaign = () => {
    setEditing({
      id: "",
      name: "",
      slug: "",
      district: null,
      description: "",
      status: "draft",
      hasArtwork: false,
      canvas: { width: 1080, height: 1350 },
      art: { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
      photoConfig: null,
      nameConfig: null,
      frames: 0,
      shares: 0,
      createdAt: "",
      updatedAt: "",
    });
    setPhoto({ ...DEFAULT_PHOTO });
    setName({ ...DEFAULT_NAME });
    setActiveLayer("art");
    setSaveMsg(null);
    document.getElementById("campaign-studio")?.scrollIntoView({ behavior: "smooth" });
  };

  const patchEditing = (patch: Partial<CampaignDto>) =>
    setEditing((prev) => (prev ? { ...prev, ...patch } : prev));

  const slugify = (text: string) =>
    text.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]+/g, "").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");

  const handleNameChange = (value: string) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const prevSlug = slugify(prev.name || "");
      const nextSlug = !prev.slug || prev.slug === prevSlug ? slugify(value) : prev.slug;
      return { ...prev, name: value, slug: nextSlug };
    });
  };

  const handleUpload = async (file: File) => {
    if (!editing) return;
    setUploading(true);
    try {
      // Compute cover-fit geometry before uploading.
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.src = objectUrl;
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });
      const fit = coverFitGeometry(img.naturalWidth, img.naturalHeight, editing.canvas.width, editing.canvas.height);
      URL.revokeObjectURL(objectUrl);

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read the file"));
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/admin/campaigns/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataUrl,
          campaignId: editing.id || undefined,
          name: editing.name || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Upload failed");

      const created = data.campaign as { id: string; name: string; slug: string; status: CampaignDto["status"] };
      setEditing((prev) =>
        prev
          ? {
              ...prev,
              id: prev.id || created.id,
              slug: prev.slug || created.slug,
              hasArtwork: true,
              art: { ...fit, rotation: 0 },
            }
          : prev
      );
      if (!editing.id) await load();
      showToast("Artwork uploaded as the base layer");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      setSaveMsg({ ok: false, text: "Campaign name is required." });
      return;
    }
    if (!editing.hasArtwork) {
      setSaveMsg({ ok: false, text: "Upload artwork before saving." });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const payload = {
        name: editing.name,
        slug: editing.slug,
        district: editing.district,
        description: editing.description,
        status: editing.status,
        canvas_width: editing.canvas.width,
        canvas_height: editing.canvas.height,
        art_x: editing.art.x,
        art_y: editing.art.y,
        art_w: editing.art.width,
        art_h: editing.art.height,
        art_rotation: editing.art.rotation,
        photoConfig: photo,
        nameConfig: name,
      };
      const res = await fetch(editing.id ? `/api/admin/campaigns/${editing.id}` : "/api/admin/campaigns", {
        method: editing.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Save failed");
      const saved = data.campaign as { id: string; slug: string };
      setEditing((prev) => (prev ? { ...prev, id: prev.id || saved.id, slug: saved.slug } : prev));
      setSaveMsg({ ok: true, text: `Saved. Public page: /campaign/${saved.slug}` });
      showToast("Campaign saved");
      void load();
    } catch (err) {
      setSaveMsg({ ok: false, text: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this campaign? Its artwork and analytics are removed too.")) return;
    const res = await fetch(`/api/admin/campaigns/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      showToast(data.error || "Delete failed");
      return;
    }
    if (editing?.id === id) newCampaign();
    showToast("Campaign deleted");
    void load();
  };

  const preset = editing ? findMatchingPreset(editing.canvas.width, editing.canvas.height) : null;
  const artworkUrl =
    editing && editing.hasArtwork && editing.id ? `/api/admin/campaigns/${editing.id}/artwork?v=${editing.updatedAt || ""}` : null;

  const metricCards: { label: string; value: number; accent: string }[] = [
    { label: "Active campaigns", value: metrics?.byStatus.active ?? 0, accent: "text-jade-deep" },
    { label: "Drafts", value: metrics?.byStatus.draft ?? 0, accent: "text-ink-soft" },
    { label: "Frames generated", value: metrics?.totalFrames ?? 0, accent: "text-saffron-deep" },
    { label: "Shares", value: metrics?.totalShares ?? 0, accent: "text-teal" },
  ];

  return (
    <div className="space-y-6">
      {/* Metrics row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metricCards.map((m) => (
          <div key={m.label} className="glass rounded-2xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">{m.label}</p>
            <p className={`font-display text-2xl font-bold ${m.accent}`}>{m.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Studio */}
      <section id="campaign-studio" className="glass rounded-3xl p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-soft">Campaign studio</p>
            <h2 className="font-display text-2xl font-bold text-ink">
              {editing?.id ? "Edit campaign composition" : "Design a new campaign frame"}
            </h2>
          </div>
          {editing?.id ? (
            <button type="button" onClick={newCampaign} className="inline-flex items-center gap-1.5 rounded-xl border border-shell bg-white px-3.5 py-2 text-xs font-bold text-ink hover:bg-sand">
              <Plus className="h-3.5 w-3.5" /> New campaign
            </button>
          ) : null}
        </div>

        {!editing ? (
          <div className="mt-6 rounded-2xl border border-dashed border-shell bg-white/60 p-8 text-center">
            <Layers className="mx-auto h-8 w-8 text-saffron" />
            <p className="mt-2 font-display text-lg font-bold text-ink">No campaign loaded</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
              Pick a campaign below to edit its composition, or start a new one: upload artwork as the base layer, then add a Photo Area and a Name Area on demand.
            </p>
            <button type="button" onClick={newCampaign} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-teal-deep">
              <Plus className="h-4 w-4" /> Start a new campaign
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            {/* Info fields */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">Campaign name *</span>
                <input
                  value={editing.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Sunrise Yogotsav Ahmedabad"
                  className="mt-1.5 w-full rounded-xl border border-shell bg-white px-3.5 py-2.5 text-sm font-medium text-ink placeholder:text-ink-soft/50 focus:border-saffron focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">Slug *</span>
                <input
                  value={editing.slug}
                  onChange={(e) => patchEditing({ slug: slugify(e.target.value) })}
                  placeholder="sunrise-yogotsav-ahmedabad"
                  className="mt-1.5 w-full rounded-xl border border-shell bg-white px-3.5 py-2.5 font-mono text-sm text-ink focus:border-saffron focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">District</span>
                <input
                  value={editing.district ?? ""}
                  onChange={(e) => patchEditing({ district: e.target.value || null })}
                  placeholder="Statewide (optional)"
                  list="campaign-districts"
                  className="mt-1.5 w-full rounded-xl border border-shell bg-white px-3.5 py-2.5 text-sm text-ink focus:border-saffron focus:outline-none"
                />
                <datalist id="campaign-districts">
                  {districts.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">Status</span>
                <select
                  value={editing.status}
                  onChange={(e) => patchEditing({ status: e.target.value as CampaignDto["status"] })}
                  className="mt-1.5 w-full rounded-xl border border-shell bg-white px-3.5 py-2.5 text-sm font-semibold text-ink focus:border-saffron focus:outline-none"
                >
                  <option value="draft">Draft (editing)</option>
                  <option value="active">Active (live &amp; public)</option>
                  <option value="paused">Paused (temporarily hidden)</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">Description (optional)</span>
              <textarea
                rows={2}
                value={editing.description}
                onChange={(e) => patchEditing({ description: e.target.value })}
                className="mt-1.5 w-full resize-none rounded-xl border border-shell bg-white px-3.5 py-2.5 text-sm text-ink focus:border-saffron focus:outline-none"
              />
            </label>

            {/* Size presets */}
            <div className="rounded-2xl border border-shell bg-sand/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-teal">Output size</p>
                  <p className="text-xs text-ink-soft">Canvas, editor stage and generated exports all match this size.</p>
                </div>
                <div className="rounded-xl border border-shell bg-white px-3.5 py-2 text-right">
                  <span className="block font-mono text-xs font-extrabold text-ink">
                    {editing.canvas.width} × {editing.canvas.height} px
                  </span>
                  <span className="block text-[10px] font-bold uppercase text-ink-soft">{preset?.aspectRatio}</span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 border-b border-shell pb-2.5">
                {PRESET_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      const first = SIZE_PRESETS.find((p) => p.category === cat);
                      if (first && cat !== "Custom") {
                        patchEditing({ canvas: { width: first.width, height: first.height } });
                      }
                    }}
                    className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                      preset?.category === cat ? "bg-teal text-white shadow-sm" : "border border-shell bg-white text-ink-soft hover:bg-sand"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              {preset && preset.category !== "Custom" ? (
                <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  {SIZE_PRESETS.filter((p) => p.category === preset.category).map((p) => {
                    const selected = editing.canvas.width === p.width && editing.canvas.height === p.height;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => patchEditing({ canvas: { width: p.width, height: p.height } })}
                        className={`rounded-xl border p-3 text-left transition ${
                          selected ? "border-saffron bg-white ring-2 ring-saffron/30" : "border-shell bg-white hover:border-teal/40"
                        }`}
                      >
                        <span className="flex items-center justify-between">
                          <span className="text-xs font-bold text-ink">{p.name}</span>
                          <span className="rounded bg-sand px-1.5 py-0.5 font-mono text-[10px] font-extrabold text-ink-soft">{p.badge}</span>
                        </span>
                        <span className="mt-1 block font-mono text-[11px] font-semibold text-teal">{p.width} × {p.height} px</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-shell bg-white p-3.5">
                  <NumField label="Width (px)" value={editing.canvas.width} min={300} max={4000} onChange={(v) => patchEditing({ canvas: { ...editing.canvas, width: Math.min(4000, Math.max(300, Math.round(v) || 1080)) } })} />
                  <NumField label="Height (px)" value={editing.canvas.height} min={300} max={4000} onChange={(v) => patchEditing({ canvas: { ...editing.canvas, height: Math.min(4000, Math.max(300, Math.round(v) || 1350)) } })} />
                </div>
              )}
            </div>

            {editing.slug ? (
              <p className="flex items-center gap-2 rounded-xl border border-shell bg-sand/60 px-3.5 py-2 text-xs">
                <ExternalLink className="h-3.5 w-3.5 text-ink-soft" />
                <span className="text-ink-soft">Public page:</span>
                <code className="font-mono font-bold text-teal">/campaign/{editing.slug}</code>
                {editing.status !== "active" && <span className="ml-auto text-[10px] font-bold uppercase text-saffron-deep">visible when active</span>}
              </p>
            ) : null}

            {/* Canvas + sidebar */}
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <CanvasStage
                campaign={editing}
                artworkUrl={artworkUrl}
                photo={photo}
                name={name}
                activeLayer={activeLayer}
                onSelectLayer={setActiveLayer}
                onArtRect={(r) => setEditing((prev) => (prev ? { ...prev, art: { ...prev.art, ...r } } : prev))}
                onPhotoRect={(r) => setPhoto((prev) => ({ ...prev, ...r }))}
                onNameRect={(r) => setName((prev) => ({ ...prev, ...r }))}
                preview={preview}
                uploading={uploading}
                onPickFile={() => fileRef.current?.click()}
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUpload(file);
                  e.target.value = "";
                }}
              />

              {/* Sidebar */}
              <div className="space-y-4">
                <div className="rounded-2xl border border-shell bg-white p-4">
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-soft">
                    <Layers className="h-3.5 w-3.5" /> Artwork layer
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <NumField label="X %" value={editing.art.x} min={-50} max={100} step={0.5} onChange={(v) => setEditing((prev) => (prev ? { ...prev, art: { ...prev.art, x: v } } : prev))} />
                    <NumField label="Y %" value={editing.art.y} min={-50} max={100} step={0.5} onChange={(v) => setEditing((prev) => (prev ? { ...prev, art: { ...prev.art, y: v } } : prev))} />
                    <NumField label="Width %" value={editing.art.width} min={4} max={200} step={0.5} onChange={(v) => setEditing((prev) => (prev ? { ...prev, art: { ...prev.art, width: v } } : prev))} />
                    <NumField label="Height %" value={editing.art.height} min={4} max={200} step={0.5} onChange={(v) => setEditing((prev) => (prev ? { ...prev, art: { ...prev.art, height: v } } : prev))} />
                    <NumField label="Rotation °" value={editing.art.rotation} min={-180} max={180} step={1} onChange={(v) => setEditing((prev) => (prev ? { ...prev, art: { ...prev.art, rotation: v } } : prev))} />
                  </div>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-teal px-4 py-2.5 text-xs font-bold text-white shadow hover:bg-teal-deep disabled:opacity-60"
                  >
                    {uploading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {editing.hasArtwork ? "Replace artwork" : "Upload artwork"}
                  </button>
                </div>

                {/* Photo area */}
                <div className="rounded-2xl border border-shell bg-white p-4">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-soft">
                      <UserRound className="h-3.5 w-3.5" /> Photo area
                    </p>
                    {photo.enabled ? (
                      <button type="button" onClick={() => { setPhoto({ ...photo, enabled: false }); setActiveLayer("art"); }} className="text-[11px] font-bold text-coral hover:underline">
                        Remove
                      </button>
                    ) : (
                      <button type="button" onClick={() => { setPhoto({ ...photo, enabled: true }); setActiveLayer("photo"); }} className="text-[11px] font-bold text-teal hover:underline">
                        Add
                      </button>
                    )}
                  </div>
                  {photo.enabled && (
                    <div className="mt-3 space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Shape</span>
                          <select
                            value={photo.shape}
                            onChange={(e) => setPhoto({ ...photo, shape: e.target.value as CampaignPhotoConfig["shape"] })}
                            className="mt-1 w-full rounded-lg border border-shell bg-white px-2.5 py-1.5 text-xs font-semibold text-ink focus:border-saffron focus:outline-none"
                          >
                            <option value="square">Square</option>
                            <option value="circle">Circle</option>
                          </select>
                        </label>
                        <NumField label="Rotation °" value={photo.rotation} min={-180} max={180} onChange={(v) => setPhoto({ ...photo, rotation: v })} />
                        <NumField label="X %" value={photo.x} min={0} max={96} step={0.5} onChange={(v) => setPhoto({ ...photo, x: v })} />
                        <NumField label="Y %" value={photo.y} min={0} max={96} step={0.5} onChange={(v) => setPhoto({ ...photo, y: v })} />
                        <NumField label="Width %" value={photo.width} min={4} max={100} step={0.5} onChange={(v) => setPhoto({ ...photo, width: v })} />
                        <NumField label="Height %" value={photo.height} min={4} max={100} step={0.5} onChange={(v) => setPhoto({ ...photo, height: v })} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Name area */}
                <div className="rounded-2xl border border-shell bg-white p-4">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-soft">
                      <Pencil className="h-3.5 w-3.5" /> Name area
                    </p>
                    {name.enabled ? (
                      <button type="button" onClick={() => { setName({ ...name, enabled: false }); setActiveLayer("art"); }} className="text-[11px] font-bold text-coral hover:underline">
                        Remove
                      </button>
                    ) : (
                      <button type="button" onClick={() => { setName({ ...name, enabled: true }); setActiveLayer("name"); }} className="text-[11px] font-bold text-teal hover:underline">
                        Add
                      </button>
                    )}
                  </div>
                  {name.enabled && (
                    <div className="mt-3 space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <NumField label="X %" value={name.x} min={0} max={96} step={0.5} onChange={(v) => setName({ ...name, x: v })} />
                        <NumField label="Y %" value={name.y} min={0} max={96} step={0.5} onChange={(v) => setName({ ...name, y: v })} />
                        <NumField label="Width %" value={name.width} min={4} max={100} step={0.5} onChange={(v) => setName({ ...name, width: v })} />
                        <NumField label="Height %" value={name.height} min={4} max={100} step={0.5} onChange={(v) => setName({ ...name, height: v })} />
                        <NumField label="Rotation °" value={name.rotation} min={-180} max={180} onChange={(v) => setName({ ...name, rotation: v })} />
                        <NumField label="Font size" value={name.font_size} min={10} max={120} onChange={(v) => setName({ ...name, font_size: v })} />
                      </div>
                      <label className="block">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Font family</span>
                        <select
                          value={name.font_family}
                          onChange={(e) => setName({ ...name, font_family: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-shell bg-white px-2.5 py-1.5 text-xs font-semibold text-ink focus:border-saffron focus:outline-none"
                        >
                          <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
                          <option value="Fraunces">Fraunces</option>
                          <option value="DM Sans">DM Sans</option>
                          <option value="Arial">Arial</option>
                        </select>
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <label className="block">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Weight</span>
                          <select
                            value={name.font_weight}
                            onChange={(e) => setName({ ...name, font_weight: e.target.value as CampaignNameConfig["font_weight"] })}
                            className="mt-1 w-full rounded-lg border border-shell bg-white px-2 py-1.5 text-xs font-semibold text-ink focus:border-saffron focus:outline-none"
                          >
                            <option value="bold">Bold</option>
                            <option value="normal">Normal</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Align</span>
                          <select
                            value={name.alignment}
                            onChange={(e) => setName({ ...name, alignment: e.target.value as CampaignNameConfig["alignment"] })}
                            className="mt-1 w-full rounded-lg border border-shell bg-white px-2 py-1.5 text-xs font-semibold text-ink focus:border-saffron focus:outline-none"
                          >
                            <option value="center">Center</option>
                            <option value="left">Left</option>
                            <option value="right">Right</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Color</span>
                          <input
                            type="color"
                            value={name.font_color}
                            onChange={(e) => setName({ ...name, font_color: e.target.value })}
                            className="mt-1 h-[34px] w-full rounded-lg border border-shell bg-white px-1"
                          />
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <NumField label="Letter spacing" value={name.letter_spacing} min={-5} max={24} step="any" onChange={(v) => setName({ ...name, letter_spacing: v })} />
                        <NumField label="Line height" value={name.line_height ?? 1.2} min={0.5} max={4} step="any" onChange={(v) => setName({ ...name, line_height: v })} />
                        <NumField label="Text scale" value={name.text_scale ?? 1} min={0.25} max={3} step="any" onChange={(v) => setName({ ...name, text_scale: v })} />
                        <NumField label="Text opacity" value={name.text_opacity ?? 1} min={0} max={1} step="any" onChange={(v) => setName({ ...name, text_opacity: v })} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Save bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-shell pt-4">
              <button
                type="button"
                onClick={() => setPreview(!preview)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold shadow-sm transition ${
                  preview ? "border-saffron bg-saffron text-ink" : "border-shell bg-white text-ink hover:bg-sand"
                }`}
              >
                {preview ? <Eye className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {preview ? "Exit preview" : "Live preview"}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || !editing.hasArtwork}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal px-6 py-3.5 text-sm font-extrabold text-white shadow-lg hover:bg-teal-deep disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                {editing.hasArtwork ? "Save campaign composition" : "Upload artwork before saving"}
              </button>
            </div>
            {saveMsg && (
              <p className={`rounded-xl p-3 text-center text-xs font-bold ${saveMsg.ok ? "bg-jade/10 text-jade-deep" : "bg-coral/10 text-coral"}`}>
                {saveMsg.text}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Campaign list */}
      <section className="glass rounded-3xl p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold text-ink">All campaigns</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-soft" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                  void load({ search: e.target.value, page: 1 });
                }}
                placeholder="Search name or slug…"
                className="w-44 rounded-xl border border-shell bg-white py-2 pl-9 pr-3 text-xs font-medium text-ink placeholder:text-ink-soft/60 focus:border-saffron focus:outline-none"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
                void load({ status: e.target.value, page: 1 });
              }}
              className="rounded-xl border border-shell bg-white px-3 py-2 text-xs font-bold text-ink focus:border-saffron focus:outline-none"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="mt-6 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-sand" />
            ))}
          </div>
        ) : error ? (
          <div className="mt-6 rounded-2xl bg-coral/10 p-4 text-sm font-bold text-coral">
            {error}{" "}
            <button type="button" onClick={() => void load()} className="underline">
              Retry
            </button>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-shell bg-white/60 p-8 text-center text-sm text-ink-soft">
            No campaigns yet. Start your first one above — upload artwork, add a photo area, publish.
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {campaigns.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-shell bg-white p-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-sm font-bold text-ink">{c.name}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLES[c.status]}`}>{c.status}</span>
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-ink-soft">
                    /campaign/{c.slug} · {c.frames} frames · {c.shares} shares
                    {c.district ? ` · ${c.district}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => void loadIntoEditor(c.id)} className="rounded-lg border border-shell px-3 py-1.5 text-[11px] font-bold text-ink hover:bg-sand">
                    Edit
                  </button>
                  <a href={`/campaign/${c.slug}`} target="_blank" rel="noreferrer" className="rounded-lg border border-shell px-3 py-1.5 text-[11px] font-bold text-teal hover:bg-sand">
                    Open
                  </a>
                  <button type="button" onClick={() => void remove(c.id)} className="rounded-lg border border-coral/30 px-2.5 py-1.5 text-[11px] font-bold text-coral hover:bg-coral/10" aria-label={`Delete ${c.name}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {pagination.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-shell px-3 py-1.5 text-xs font-bold text-ink disabled:opacity-40">
              Previous
            </button>
            <span className="text-xs font-bold text-ink-soft">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button type="button" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)} className="rounded-lg border border-shell px-3 py-1.5 text-xs font-bold text-ink disabled:opacity-40">
              Next
            </button>
          </div>
        )}
      </section>

      {/* Toast */}
      <div
        role="status"
        className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-gold/30 bg-ink px-5 py-3 text-xs font-bold text-cream shadow-2xl transition-all ${toast ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0"}`}
      >
        {toast}
      </div>
    </div>
  );
}
