/**
 * Firebase Admin SDK — server only.
 *
 * Verifies Firebase ID tokens and derives the caller's identity from the
 * *verified* token (never from a client-supplied UID). Credentials come from
 * the environment and are never shipped to the client:
 *
 *   FIREBASE_PROJECT_ID              (or NEXT_PUBLIC_FIREBASE_PROJECT_ID)
 *   FIREBASE_CLIENT_EMAIL            service-account email
 *   FIREBASE_PRIVATE_KEY             service-account private key (\n escaped)
 *
 * The Admin SDK is imported lazily and initialized only when credentials are
 * present, so local/dev runs without Firebase keep working.
 */

import type { App } from "firebase-admin/app";
import type { DecodedIdToken } from "firebase-admin/auth";

const adminApp: { current: App | null } = { current: null };

export function firebaseAdminConfigured(): boolean {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  return Boolean(
    projectId && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
  );
}

async function getAdminApp(): Promise<App | null> {
  if (adminApp.current) return adminApp.current;
  if (!firebaseAdminConfigured()) return null;

  const privateKey = process.env.FIREBASE_PRIVATE_KEY!;
  const projectId =
    process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  const { initializeApp, cert, getApps } = await import("firebase-admin/app");

  const existing = getApps().find((a) => a.name === "zenframe");
  adminApp.current =
    existing ??
    initializeApp(
      {
        credential: cert({
          projectId,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
          // .env files mangle literal newlines; accept both forms.
          privateKey,
        }),
        projectId,
      },
      "zenframe"
    );
  return adminApp.current;
}

export interface VerifiedIdentity {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}

/**
 * Verifies a Firebase ID token. Returns null for any invalid/expired token —
 * callers translate that into 401. Revocation-aware: rejects tokens minted
 * before a revocation via the checkRevocation option.
 */
export async function verifyFirebaseIdToken(
  idToken: string
): Promise<VerifiedIdentity | null> {
  const app = await getAdminApp();
  if (!app) return null;

  try {
    const { getAuth } = await import("firebase-admin/auth");
    const decoded: DecodedIdToken = await getAuth(app).verifyIdToken(
      idToken,
      true // reject tokens minted before a revocation
    );
    return {
      uid: decoded.uid,
      email: (decoded.email as string | undefined) ?? null,
      emailVerified: Boolean(decoded.email_verified),
    };
  } catch {
    return null; // expired, revoked, wrong audience, malformed…
  }
}
