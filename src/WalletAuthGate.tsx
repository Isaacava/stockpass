import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import type { Provider } from '@reown/appkit-adapter-solana';
import { authenticateWallet, clearWalletSession, loadWalletSession } from './lib/walletAuth';

export default function WalletAuthGate({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider<Provider>('solana');
  const [status, setStatus] = useState<'waiting' | 'signing' | 'ready' | 'error'>('waiting');
  const [error, setError] = useState('');
  const inFlight = useRef<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) {
      clearWalletSession();
      inFlight.current = null;
      setStatus('waiting');
      setError('');
      return;
    }

    const existing = loadWalletSession();
    if (existing?.wallet === address) {
      setStatus('ready');
      return;
    }

    if (!walletProvider || inFlight.current === address) return;
    inFlight.current = address;
    let cancelled = false;

    (async () => {
      try {
        setStatus('signing');
        setError('');
        const session = await authenticateWallet({
          publicKey: { toBase58: () => address },
          signMessage: (message) => walletProvider.signMessage(message),
        });
        if (!cancelled && session.wallet === address) setStatus('ready');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Wallet verification failed.');
          setStatus('error');
        }
      } finally {
        if (inFlight.current === address) inFlight.current = null;
      }
    })();

    return () => { cancelled = true; };
  }, [address, isConnected, walletProvider]);

  const retry = () => {
    if (!address || !walletProvider || inFlight.current) return;
    inFlight.current = address;
    setStatus('signing');
    setError('');
    void authenticateWallet({
      publicKey: { toBase58: () => address },
      signMessage: (message) => walletProvider.signMessage(message),
    }).then((session) => {
      if (session.wallet === address) setStatus('ready');
    }).catch((err) => {
      setError(err instanceof Error ? err.message : 'Wallet verification failed.');
      setStatus('error');
    }).finally(() => {
      if (inFlight.current === address) inFlight.current = null;
    });
  };

  if (!isConnected || status === 'ready') return <>{children}</>;

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f3f6f9', color: '#101827', fontFamily: 'Manrope, system-ui, sans-serif' }}>
      <div style={{ width: 'min(460px, 100%)', background: '#fff', border: '1px solid #d8e1eb', borderRadius: 18, padding: 24, boxShadow: '0 22px 70px rgba(25,39,58,.10)' }}>
        <div style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', borderRadius: 12, background: '#101827', color: '#fff', marginBottom: 16 }}><ShieldCheck size={21} /></div>
        <span style={{ display: 'block', font: '700 9px/1 "DM Mono", monospace', letterSpacing: '.14em', color: '#6f7c8b' }}>WALLET VERIFICATION</span>
        <h1 style={{ margin: '9px 0 8px', fontSize: 23, letterSpacing: '-.03em' }}>Prove control before entering StockPass.</h1>
        <p style={{ margin: 0, color: '#667487', lineHeight: 1.6, fontSize: 13 }}>StockPass asks your connected Solana wallet to sign a one-time verification message. No transaction is sent and no funds move.</p>
        <div style={{ marginTop: 17, padding: 13, border: '1px solid #e4eaf1', borderRadius: 12, background: '#f8fafc', fontSize: 12, color: '#5d6a79' }}>
          <strong style={{ display: 'block', color: '#101827', marginBottom: 4 }}>{status === 'signing' ? 'Waiting for your wallet…' : status === 'error' ? 'Verification needs another try.' : 'Preparing wallet verification…'}</strong>
          {status === 'error' && <span>{error}</span>}
        </div>
        {status === 'error' && <button onClick={retry} style={{ marginTop: 14, width: '100%', border: 0, borderRadius: 10, padding: '11px 14px', background: '#2864ff', color: '#fff', fontWeight: 800 }}>Sign again</button>}
        <div style={{ marginTop: 13, fontSize: 10, color: '#8a96a4' }}>Wallet: {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '—'}</div>
      </div>
    </div>
  );
}
