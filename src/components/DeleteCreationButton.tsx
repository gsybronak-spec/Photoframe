"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Trash2, X } from "lucide-react";
import { trackClient } from "@/lib/analytics-client";

interface Props {
  creationId: string;
  /** Frame title, used in the confirmation copy and the accessible label. */
  label?: string;
  /** Called after a successful delete so lists can update in place. */
  onDeleted?: (id: string) => void;
  variant?: "icon" | "button";
}

/**
 * Deletion requires explicit confirmation. The server re-checks ownership, so
 * this dialog is convenience, not the security boundary.
 */
export function DeleteCreationButton({
  creationId,
  label = "this creation",
  onDeleted,
  variant = "icon",
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deleting) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, deleting]);

  const remove = async () => {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/creations/${creationId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not delete. Try again.");
        setDeleting(false);
        return;
      }
      trackClient("creation_deleted", {});
      setOpen(false);
      setDeleting(false);
      onDeleted?.(creationId);
      router.refresh();
    } catch {
      setError("Network trouble — try again.");
      setDeleting(false);
    }
  };

  return (
    <>
      {variant === "icon" ? (
        <button
          onClick={() => setOpen(true)}
          title={`Delete ${label}`}
          aria-label={`Delete ${label}`}
          className="glass-strong absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-coral transition focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full border border-coral/40 px-4 py-2 text-sm font-semibold text-coral transition hover:bg-coral/10"
        >
          <Trash2 className="h-4 w-4" aria-hidden /> Delete creation
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-ink/40 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`del-title-${creationId}`}
            aria-describedby={`del-body-${creationId}`}
            className="glass-strong w-full max-w-md rounded-[2rem] bg-cream/95 p-7 shadow-glass-lg"
          >
            <div className="flex items-start justify-between gap-4">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-coral/15 text-coral">
                <Trash2 className="h-5 w-5" aria-hidden />
              </span>
              <button
                onClick={() => !deleting && setOpen(false)}
                aria-label="Close dialog"
                className="rounded-full p-2 text-ink-soft transition hover:bg-white/70"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <h2
              id={`del-title-${creationId}`}
              className="mt-4 font-display text-2xl font-semibold text-ink"
            >
              Delete {label}?
            </h2>
            <p id={`del-body-${creationId}`} className="mt-2 text-sm leading-relaxed text-ink-soft">
              This permanently removes the image from your studio and from storage. Any
              public share link stops working immediately. This can&apos;t be undone.
            </p>

            {error && (
              <p
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-2xl bg-coral/10 px-4 py-3 text-sm text-coral"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
              </p>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                ref={cancelRef}
                onClick={() => setOpen(false)}
                disabled={deleting}
                className="btn-ghost rounded-full px-5 py-2.5 text-sm font-semibold text-ink disabled:opacity-50"
              >
                Keep it
              </button>
              <button
                onClick={remove}
                disabled={deleting}
                className="flex items-center gap-2 rounded-full bg-coral px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-coral/90 disabled:opacity-60"
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" aria-hidden /> Delete permanently
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
