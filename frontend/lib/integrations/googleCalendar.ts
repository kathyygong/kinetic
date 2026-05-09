// Google Calendar connection helper.
//
// Reuses Firebase's GoogleAuthProvider with the calendar.readonly scope
// added on top, so we get a real OAuth access token without standing up
// a separate Google Identity Services flow. The token is stored locally
// — the backend's calendar.py uses its own desktop OAuth setup, so this
// is just the front-end's record of "yes, the user has authorized us."

"use client";

import {
  GoogleAuthProvider,
  signInWithPopup,
  type UserCredential,
} from "firebase/auth";

import { auth } from "@/lib/firebase";

const TOKEN_STORAGE_KEY = "kinetic_gcal_token";

const CALENDAR_READONLY_SCOPE =
  "https://www.googleapis.com/auth/calendar.readonly";

export type GoogleCalendarConnection = {
  /** OAuth access token with calendar.readonly scope. */
  accessToken: string;
  /** Account email if known. */
  email?: string;
  /** Unix epoch ms when the token expires (best-effort). */
  expiresAt?: number;
};

/** Read the stored Google Calendar connection, if any. SSR-safe. */
export function getGoogleCalendarConnection(): GoogleCalendarConnection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GoogleCalendarConnection;
    if (!parsed.accessToken) return null;
    if (parsed.expiresAt && parsed.expiresAt < Date.now()) {
      // Token has expired — treat as disconnected so the UI re-prompts.
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Open the Google OAuth popup, request the calendar.readonly scope, and
 * persist the resulting access token. Throws on cancel / error so the
 * caller can surface a message.
 */
export async function connectGoogleCalendar(): Promise<GoogleCalendarConnection> {
  const provider = new GoogleAuthProvider();
  provider.addScope(CALENDAR_READONLY_SCOPE);
  // Force the consent screen so the user explicitly grants the new scope
  // even if they already signed in with Google earlier.
  provider.setCustomParameters({ prompt: "consent" });

  const result: UserCredential = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken;
  if (!accessToken) {
    throw new Error("No access token returned from Google.");
  }

  // Google access tokens are typically valid for ~1 hour. We don't get
  // the expiry directly through Firebase, so use a conservative 55-minute
  // window to leave room for clock skew.
  const conn: GoogleCalendarConnection = {
    accessToken,
    email: result.user.email ?? undefined,
    expiresAt: Date.now() + 55 * 60 * 1000,
  };

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(conn));
    } catch {
      // storage may be unavailable; the UI still reflects the connection
      // for this session via React state.
    }
  }
  return conn;
}

/** Forget the stored Google Calendar token. */
export function disconnectGoogleCalendar(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}
