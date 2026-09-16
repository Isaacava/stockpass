import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import './styles.css';
import './mobile-safety.css';
import '@solana/wallet-adapter-react-ui/styles.css';
import './reown';
import WeekendGapGuardWorkspace from './WeekendGapGuardWorkspace';

const endpoint = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('Weekend Gap Guard render error', error, info); }
  render() {
    if (this.state.error) {
      const message = this.state.error?.message || 'Unknown client-side error';
      return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: '#f3f6f9', color: '#101827', fontFamily: 'Inter, system-ui, sans-serif' }}><div style={{ width: 'min(640px, 100%)', background: '#fff', border: '1px solid #d9e1e9', borderRadius: 16, padding: 22, boxShadow: '0 18px 55px rgba(25,39,58,.08)' }}><div style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', borderRadius: 11, background: '#101827', color: '#fff', fontWeight: 800, fontSize: 11, marginBottom: 14 }}>WG</div><strong style={{ display: 'block', fontSize: 18, marginBottom: 8 }}>Weekend Gap Guard could not render</strong><p style={{ margin: 0, color: '#637083', lineHeight: 1.6 }}>The workspace threw a client-side error.</p><pre style={{ margin: '14px 0 0', padding: 12, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', borderRadius: 10, background: '#101827', color: '#d7e3f1', font: '12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace' }}>{message}</pre><button onClick={() => window.location.reload()} style={{ marginTop: 16, border: 0, borderRadius: 9, padding: '10px 14px', background: '#2467f2', color: '#fff', fontWeight: 800 }}>Reload</button></div></div>;
    }
    return this.props.children;
  }
}

function Loading() {
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f7f8fa', color: '#15202b', fontFamily: 'Inter, system-ui, sans-serif' }}><div style={{ textAlign: 'center' }}><div style={{ width: 42, height: 42, margin: '0 auto 14px', display: 'grid', placeItems: 'center', borderRadius: 12, background: '#15202b', color: '#fff', font: '800 11px/1 ui-monospace, monospace' }}>WG</div><strong style={{ display: 'block', fontSize: 16 }}>Opening Weekend Gap Guard</strong><span style={{ display: 'block', marginTop: 6, color: '#778598', fontSize: 12 }}>Loading the Solana mainnet workspace…</span></div></div>;
}

function Root() {
  return <Suspense fallback={<Loading />}><WeekendGapGuardWorkspace /></Suspense>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ConnectionProvider endpoint={endpoint}><WalletProvider wallets={[]} autoConnect><WalletModalProvider><AppErrorBoundary><Root /></AppErrorBoundary></WalletModalProvider></WalletProvider></ConnectionProvider></React.StrictMode>);
