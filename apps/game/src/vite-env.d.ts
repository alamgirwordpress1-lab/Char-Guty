/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_WS_URL?: string;
  readonly VITE_SERVER_HTTP_URL?: string;
  /** Where the web game is served; the Android app's invite links point there. */
  readonly VITE_SITE_URL?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
