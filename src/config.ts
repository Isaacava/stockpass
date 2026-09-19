export const STOCKPASS_FRONTEND_CONFIG = {
  supabaseUrl: 'https://sfbxpscbevnmoppgkjcr.supabase.co',
  supabasePublishableKey: 'sb_publishable_eCgd2QEH5mUlEK5vHIonyw_v0E8QFrp',
  solanaMainnetRpc: '/api/solana-rpc',
  reownProjectId: '1dbe8fd5e4974ae7c80d074c4082b5a0',
  telegramBotUsername: '',
} as const;

export const SUPABASE_URL =
  STOCKPASS_FRONTEND_CONFIG.supabaseUrl ||
  import.meta.env.VITE_SUPABASE_URL ||
  '';

export const SUPABASE_PUBLISHABLE_KEY =
  STOCKPASS_FRONTEND_CONFIG.supabasePublishableKey ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  '';

// The mainnet RPC is intentionally server-side only (Vercel: SOLANA_RPC_URL).
// Browser RPC calls go through /api/solana-rpc so the deployed client never reads a VITE_* RPC variable.
export const SOLANA_MAINNET_RPC = '/api/solana-rpc';

export const REOWN_PROJECT_ID =
  STOCKPASS_FRONTEND_CONFIG.reownProjectId ||
  import.meta.env.VITE_REOWN_PROJECT_ID ||
  '';

export const TELEGRAM_BOT_USERNAME =
  STOCKPASS_FRONTEND_CONFIG.telegramBotUsername ||
  import.meta.env.VITE_TELEGRAM_BOT_USERNAME ||
  '';
