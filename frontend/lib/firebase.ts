// Firebase client setup for the Kinetic Next.js frontend.
// Reads config from NEXT_PUBLIC_* env vars and exposes auth helpers.

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
  type UserCredential,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Re-use the existing app on hot reload to avoid "duplicate app" errors.
const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// --- Auth helpers -----------------------------------------------------------

export function signUpWithEmail(email: string, password: string): Promise<UserCredential> {
  return createUserWithEmailAndPassword(auth, email, password);
}

export function signInWithEmail(email: string, password: string): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password);
}

export function signInWithGoogle(): Promise<UserCredential> {
  return signInWithPopup(auth, googleProvider);
}

export function signOutUser(): Promise<void> {
  return signOut(auth);
}

export type { User };
export default app;
