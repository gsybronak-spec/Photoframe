"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, getIdToken, fbSignOut } from "@/lib/firebase-client";
import { clientAuth } from "@/lib/firebase-client";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  status: "active" | "suspended";
  emailVerified: boolean;
  emailVerifiedAt?: string | null;
  createdAt?: string;
  plan: "free" | "pro" | "studio";
  avatarUrl?: string | null;
}

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: (opts?: { all?: boolean }) => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
});

/** Set by the root layout from server env — never contains secrets. */
declare global {
  interface Window {
    __ZENFRAME_AUTH_MODE__?: "firebase" | "password";
  }
}

export function authMode(): "firebase" | "password" {
  return (
    (typeof window !== "undefined" && window.__ZENFRAME_AUTH_MODE__) || "password"
  );
}

/** Current Firebase ID token, or null when not in Firebase mode / signed out. */
export async function currentIdToken(): Promise<string | null> {
  if (authMode() !== "firebase") return null;
  try {
    return await getIdToken((await import("@/lib/firebase-client")).clientAuth().currentUser!, false);
  } catch {
    return null;
  }
}

/**
 * Client auth state is a cache of `/api/auth/me` only — the session itself lives
 * in an HttpOnly cookie and is never readable from JavaScript. In Firebase mode
 * we additionally watch the Firebase SDK only to re-sync the server session
 * cookie when the Firebase user changes; authorization always happens on the
 * server.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await res.json();
      setUser(data.ok ? (data.user as AuthUser | null) : null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (authMode() !== "firebase") return;
    let cancelled = false;
    // Watching Firebase auth state solely to keep the server session cookie in
    // step (sign-in happens on the login page; this catches token refreshes and
    // remote sign-outs).
    const unsub = onAuthStateChanged(clientAuth(), async (fbUser) => {
        if (cancelled) return;
        if (!fbUser) {
          // Firebase signed out remotely → drop the app session too.
          await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
          setUser(null);
          return;
        }
        try {
          const idToken = await getIdToken(fbUser, false);
          await fetch("/api/auth/firebase-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
          });
          await refresh();
        } catch {
          /* the session exchange failed; /api/auth/me still governs state */
        }
      }
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [refresh]);

  const logout = useCallback(
    async (opts: { all?: boolean } = {}) => {
      try {
        if (authMode() === "firebase") {
          await fbSignOut().catch(() => {});
        }
        await fetch(`/api/auth/logout${opts.all ? "?all=1" : ""}`, {
          method: "POST",
        });
      } finally {
        setUser(null);
        router.push("/");
        router.refresh();
      }
    },
    [router]
  );

  return (
    <Ctx.Provider value={{ user, loading, refresh, logout }}>{children}</Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
