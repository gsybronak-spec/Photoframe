/**
 * Firebase Authentication — client SDK (browser).
 *
 * Public web config only (NEXT_PUBLIC_FIREBASE_*): these values identify the
 * Firebase project and are safe in the browser bundle. API keys for Firebase
 * web apps are identifiers, not secrets — access control happens server-side
 * by verifying ID tokens with the Admin SDK (see ./admin.ts).
 *
 * Authentication never depends on localStorage beyond Firebase's own IndexedDB
 * persistence of the signed-in user; no credentials or tokens are stored by
 * ZenFrame code.
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  type Auth,
  type UserCredential,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged,
  getIdToken,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** True when the Firebase web config is present (browser auth available). */
export function firebaseClientConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId
  );
}

function clientApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function clientAuth(): Auth {
  return getAuth(clientApp());
}

/* ------------------------------------------------------------------ */
/* Auth operations (reject with a friendly message on Firebase errors) */
/* ------------------------------------------------------------------ */

function friendlyMessage(err: unknown): string {
  const code =
    typeof err === "object" && err && "code" in err
      ? String((err as { code: string }).code)
      : "";
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/invalid-email":
      return "That email doesn't look right.";
    case "auth/weak-password":
      return "Choose a stronger password (at least 8 characters).";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Email or password is incorrect.";
    case "auth/too-many-requests":
      return "Too many attempts — try again in a little while.";
    case "auth/network-request-failed":
      return "Network problem — check your connection and try again.";
    case "auth/operation-not-allowed":
      return "Email/password sign-in is not enabled for this project yet.";
    default:
      return "Authentication failed. Please try again.";
  }
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
  }
}

export async function fbSignUp(
  email: string,
  password: string
): Promise<UserCredential> {
  try {
    return await createUserWithEmailAndPassword(clientAuth(), email, password);
  } catch (err) {
    throw new AuthError(friendlyMessage(err), firebaseErrorCode(err));
  }
}

export async function fbSignIn(
  email: string,
  password: string
): Promise<UserCredential> {
  try {
    return await signInWithEmailAndPassword(clientAuth(), email, password);
  } catch (err) {
    throw new AuthError(friendlyMessage(err), firebaseErrorCode(err));
  }
}

export async function fbSignOut(): Promise<void> {
  await signOut(clientAuth());
}

/** Sends Firebase's own verification email (template managed in Firebase Console). */
export async function fbSendVerification(user: { uid: string }): Promise<void> {
  const auth = clientAuth();
  const target = auth.currentUser?.uid === user.uid ? auth.currentUser : null;
  if (!target) throw new AuthError("Not signed in.", "auth/no-current-user");
  await sendEmailVerification(target).catch((err) => {
    throw new AuthError(friendlyMessage(err), firebaseErrorCode(err));
  });
}

/** Firebase-hosted password reset email; action URL configured in the Console. */
export async function fbSendPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(clientAuth(), email);
  } catch (err) {
    throw new AuthError(friendlyMessage(err), firebaseErrorCode(err));
  }
}

export function firebaseErrorCode(err: unknown): string {
  return typeof err === "object" && err && "code" in err
    ? String((err as { code: string }).code)
    : "auth/unknown";
}

export { onAuthStateChanged, getIdToken };
