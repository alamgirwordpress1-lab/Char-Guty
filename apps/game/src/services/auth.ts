import { type FirebaseApp, initializeApp } from "firebase/app";
import {
  type Auth,
  FacebookAuthProvider,
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export interface FirebaseSession {
  readonly token: string;
  readonly nickname: string;
}

let app: FirebaseApp | undefined;
let auth: Auth | undefined;

function firebaseAuth(): Auth {
  app ??= initializeApp(firebaseConfig);
  auth ??= getAuth(app);
  return auth;
}

async function toSession(user: User): Promise<FirebaseSession> {
  const token = await user.getIdToken();
  return { token, nickname: user.displayName ?? "Player" };
}

export async function signInWithGoogle(): Promise<FirebaseSession> {
  const credential = await signInWithPopup(firebaseAuth(), new GoogleAuthProvider());
  return toSession(credential.user);
}

export async function signInWithFacebook(): Promise<FirebaseSession> {
  const credential = await signInWithPopup(firebaseAuth(), new FacebookAuthProvider());
  return toSession(credential.user);
}

export async function signOutFirebase(): Promise<void> {
  if (auth !== undefined) await firebaseSignOut(auth);
}
