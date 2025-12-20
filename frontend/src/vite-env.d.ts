/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_DNS: string;
  readonly VITE_FRONTEND_DNS: string;
  readonly VITE_API_BASE_URL: string;
  readonly VITE_BACKEND_CONTEXT_PATH: string;
  readonly VITE_FRONTEND_BASE_PATH: string;
  readonly VITE_APP_TITLE: string;
  readonly VITE_POLL_INTERVAL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
