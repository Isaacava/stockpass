import { supabase } from './supabase';
import { clearStoredWalletSession, readWalletSession, writeWalletSession, type WalletSessionRecord } from './walletSession';

type WalletSigner = {
  publicKey?: { toBase58: () => string } | null;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
};

type WalletAuthResult = WalletSessionRecord;

function encodeBase58(bytes: Uint8Array) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);
  let encoded = '';
  while (value > 0n) {
    const remainder = Number(value % 58n);
    encoded = alphabet[remainder] + encoded;
    value = value / 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = alphabet[0] + encoded;
  }
  return encoded || alphabet[0];
}

export function loadWalletSession() {
  return readWalletSession();
}

export function clearWalletSession() {
  clearStoredWalletSession();
}

export async function authenticateWallet(wallet: WalletSigner): Promise<WalletAuthResult> {
  const address = wallet.publicKey?.toBase58();
  if (!address || !wallet.signMessage) {
    throw new Error('This wallet does not expose message signing.');
  }

  const { data: challenge, error: challengeError } = await supabase.functions.invoke('wallet-auth', {
    body: { action: 'challenge', wallet: address },
  });
  if (challengeError || !challenge?.message) {
    throw new Error(challengeError?.message ?? challenge?.error ?? 'Could not create wallet challenge.');
  }

  const signatureBytes = await wallet.signMessage(new TextEncoder().encode(challenge.message));
  const signature = encodeBase58(signatureBytes);

  const { data, error } = await supabase.functions.invoke('wallet-auth', {
    body: {
      action: 'verify',
      wallet: address,
      message: challenge.message,
      signature,
    },
  });
  if (error || !data?.token || !data?.wallet || !data?.expiresAt) {
    throw new Error(error?.message ?? data?.error ?? 'Could not verify wallet signature.');
  }

  const session = data as WalletAuthResult;
  writeWalletSession(session);
  return session;
}

export async function refreshWalletSession(wallet: WalletSigner) {
  const current = loadWalletSession();
  const address = wallet.publicKey?.toBase58();
  if (current && address && current.wallet === address) return current;
  clearWalletSession();
  return authenticateWallet(wallet);
}

export function walletAuthHeaders(): HeadersInit {
  const session = loadWalletSession();
  return session ? { 'x-stockpass-session': session.token } : {};
}
