export const WALLET_SESSION_STORAGE_KEY = 'stockpass.wallet.session';

export type WalletSessionRecord = {
  wallet: string;
  token: string;
  expiresAt: string;
};

export function readWalletSession(): WalletSessionRecord | null {
  try {
    const raw = localStorage.getItem(WALLET_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as WalletSessionRecord;
    if (!session.wallet || !session.token || !session.expiresAt) return null;
    if (Date.parse(session.expiresAt) <= Date.now()) {
      localStorage.removeItem(WALLET_SESSION_STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function readWalletSessionToken() {
  return readWalletSession()?.token ?? null;
}

export function writeWalletSession(session: WalletSessionRecord) {
  localStorage.setItem(WALLET_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredWalletSession() {
  localStorage.removeItem(WALLET_SESSION_STORAGE_KEY);
}
