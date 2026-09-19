/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_REOWN_PROJECT_ID?: string;
  readonly VITE_TELEGRAM_BOT_USERNAME?: string;
  readonly VITE_AAPLX_MINT?: string;
  readonly VITE_NVDAX_MINT?: string;
  readonly VITE_TSLAX_MINT?: string;
  readonly VITE_SPYX_MINT?: string;
  readonly VITE_MSFTX_MINT?: string;
  readonly VITE_METAX_MINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
