/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Server URL pre-filled on the activation screen (see .env.production). */
  readonly VITE_DEFAULT_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
