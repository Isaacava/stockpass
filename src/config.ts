export const STOCKPASS_FRONTEND_CONFIG = {
  supabaseUrl: 'https://sfbxpscbevnmoppgkjcr.supabase.co',
  supabasePublishableKey: 'sb_publishable_eCgd2QEH5mUlEK5vHIonyw_v0E8QFrp',
  solanaMainnetRpc: 'https://api.mainnet-beta.solana.com',
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

export const SOLANA_MAINNET_RPC =
  STOCKPASS_FRONTEND_CONFIG.solanaMainnetRpc ||
  import.meta.env.VITE_SOLANA_RPC_URL ||
  import.meta.env.VITE_SOLANA_MAINNET_RPC_URL ||
  '';

export const REOWN_PROJECT_ID =
  STOCKPASS_FRONTEND_CONFIG.reownProjectId ||
  import.meta.env.VITE_REOWN_PROJECT_ID ||
  '';

export const TELEGRAM_BOT_USERNAME =
  STOCKPASS_FRONTEND_CONFIG.telegramBotUsername ||
  import.meta.env.VITE_TELEGRAM_BOT_USERNAME ||
  '';
