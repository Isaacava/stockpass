import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useAppKitAccount } from '@reown/appkit/react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import './mobile-safety.css';

const Workspace = lazy(() => import('./WeekendGapGuardWorkspace'));

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('StockPass render error', error, info); }
  render() {
    if (this.state.error) {
      const message = this.state.error?.message || 'Unknown client-side error';
      return <div className="wgg-boot-error"><div><div className="wgg-boot-error-code">STOCKPASS / CLIENT ERROR</div><h1>The workspace hit a browser error.</h1><p>{message}</p><button onClick={() => window.location.reload()}>Reload StockPass</button></div></div>;
    }
    return this.props.children;
  }
}

function LandingGate({ onConnect, status, error }: { onConnect: () => void; status: 'starting' | 'ready' | 'error'; error: string }) {
  return <div className="wgg-gate">
    <header className="wgg-gate-nav">
      <div className="wgg-gate-brand"><span className="wgg-gate-mark">SP</span><div><strong>STOCKPASS</strong><small>WEEKEND GAP GUARD</small></div></div>
      <div className="wgg-gate-network"><i /> SOLANA MAINNET</div>
    </header>
    <main className="wgg-gate-main">
      <section className="wgg-gate-copy">
        <div className="wgg-gate-kicker"><span /> MARKET RISK / READY</div>
        <h1>Protect the position<br /><em>before Monday.</em></h1>
        <p>Connect your Solana wallet to read real Kamino xStock collateral, measure weekend-gap exposure, and unlock the protected workspace.</p>
        <button className="wgg-gate-connect" onClick={onConnect} disabled={status === 'starting'}>{status === 'starting' ? 'Starting wallet connector…' : 'Connect Solana wallet →'}</button>
        <div className="wgg-gate-proof"><span>POSITION TRUTH</span><b>KAMINO</b><span>MARKET CONTEXT</span><b>XSTOCKS</b><span>SCENARIO</span><b>WEEKEND GAP</b><span>ACTION</span><b>WALLET SIGNATURE</b></div>
        {error && <div className="wgg-gate-error">{error}</div>}
      </section>
      <aside className="wgg-gate-card">
        <div className="wgg-gate-card-top"><span>WGG / 01</span><span><i /> ONLINE</span></div>
        <div className="wgg-gate-orbit"><div /><span /><span /><span /></div>
        <div className="wgg-gate-card-lines"><div><span>1 / POSITION</span><strong>KAMINO STATE</strong></div><div><span>2 / STRESS</span><strong>STRESSED LTV</strong></div><div><span>3 / CONTROL</span><strong>WALLET APPROVAL</strong></div></div>
      </aside>
    </main>
  </div>;
}

function ConnectedRoute({ connect }: { connect: () => void }) {
  const { isConnected } = useAppKitAccount({ namespace: 'solana' });
  if (!isConnected) return <LandingGate onConnect={connect} status="ready" error="" />;
  return <Suspense fallback={<div className="wgg-auth-transition"><div className="wgg-auth-panel"><span className="wgg-gate-mark">SP</span><strong>Opening your risk workspace</strong><span>Loading the authenticated Solana workspace…</span></div></div>}><Workspace /></Suspense>;
}

function AppShell() {
  const [walletReady, setWalletReady] = useState(false);
  const [status, setStatus] = useState<'starting' | 'ready' | 'error'>('starting');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    import('./reown').then(() => {
      if (!active) return;
      setWalletReady(true);
      setStatus('ready');
    }).catch((cause) => {
      if (!active) return;
      const message = cause instanceof Error ? cause.message : String(cause);
      console.error('StockPass wallet connector preload failed', cause);
      setStatus('error');
      setError(message);
    });
    return () => { active = false; };
  }, []);

  const connect = () => {
    if (!walletReady) {
      setStatus('starting');
      setError('The wallet connector is still starting.');
      return;
    }
    void import('./reown').then(({ appKit }) => appKit.open({ view: 'Connect', namespace: 'solana' })).catch((cause) => {
      const message = cause instanceof Error ? cause.message : String(cause);
      console.error('StockPass wallet modal failed to open', cause);
      setStatus('error');
      setError(message);
    });
  };

  if (!walletReady) return <LandingGate onConnect={connect} status={status} error={error} />;
  return <ConnectedRoute connect={connect} />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><AppErrorBoundary><AppShell /></AppErrorBoundary></React.StrictMode>);