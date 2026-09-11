import type { Auth, User } from "firebase/auth";

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

/** Google/Facebook sign-in needs the Firebase web config in apps/game/.env (see .env.example). */
export function isFirebaseConfigured(): boolean {
  return Object.values(firebaseConfig).every((value) => typeof value === "string" && value !== "");
}

// firebase/app + firebase/auth are a meaningful chunk of the bundle and most players
// never touch Google/Facebook sign-in (Guest doesn't need Firebase at all), so both
// are dynamically imported here instead of at module load - only fetched on first use.
type AuthModule = typeof import("firebase/auth");
let loaded: Promise<{ auth: Auth; mod: AuthModule }> | undefined;

function loadFirebaseAuth(): Promise<{ auth: Auth; mod: AuthModule }> {
  loaded ??= (async () => {
    const [{ initializeApp }, mod] = await Promise.all([
      import("firebase/app"),
      import("firebase/auth"),
    ]);
    const auth = mod.getAuth(initializeApp(firebaseConfig));
    return { auth, mod };
  })();
  return loaded;
}

async function toSession(user: User): Promise<FirebaseSession> {
  const token = await user.getIdToken();
  return { token, nickname: user.displayName ?? "Player" };
}

export async function signInWithGoogle(): Promise<FirebaseSession> {
  const { auth, mod } = await loadFirebaseAuth();
  const credential = await mod.signInWithPopup(auth, new mod.GoogleAuthProvider());
  return toSession(credential.user);
}

export async function signInWithFacebook(): Promise<FirebaseSession> {
  const { auth, mod } = await loadFirebaseAuth();
  const credential = await mod.signInWithPopup(auth, new mod.FacebookAuthProvider());
  return toSession(credential.user);
}

/** The Google/Facebook user Firebase kept signed in on this device, with a fresh token. */
export async function currentFirebaseSession(): Promise<FirebaseSession | null> {
  const { auth } = await loadFirebaseAuth();
  await auth.authStateReady();
  return auth.currentUser === null ? null : toSession(auth.currentUser);
}

export async function signOutFirebase(): Promise<void> {
  if (loaded === undefined) return;
  const { auth, mod } = await loaded;
  await mod.signOut(auth);
}
