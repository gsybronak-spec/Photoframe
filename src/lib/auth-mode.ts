/**
 * Auth mode selection.
 *
 *   FIREBASE_AUTH_MODE=firebase   → Firebase Authentication owns identity
 *   (anything else / unset)       → built-in password sessions (local/dev)
 *
 * Selection is driven by SERVER env so it cannot be tampered with from the
 * browser. The client learns the mode through a tiny, non-secret inline value
 * injected by the root layout.
 */

export type AuthMode = "firebase" | "password";

export function authMode(): AuthMode {
  return (process.env.FIREBASE_AUTH_MODE ?? "").trim().toLowerCase() === "firebase"
    ? "firebase"
    : "password";
}

export function isFirebaseAuth(): boolean {
  return authMode() === "firebase";
}
