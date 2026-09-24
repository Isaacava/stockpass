import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useAppKitAccount } from '@reown/appkit/react';
import ReactDOM from 'react-dom/client';
import WggHome from './WggHome';
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

function ConnectedRoute({ connect }: { connect: () => void }) {
  const { isConnected } = useAppKitAccount({ namespace: 'solana' });
  useEffect(() => {
    if (!isConnected && window.location.pathname !== '/') {
      window.history.replaceState({}, '', '/');
    }
  }, [isConnected]);
  if (!isConnected) return <WggHome onLaunch={connect} />;
  return <Suspense fallback={<div className="wgg-auth-transition"><div className="wgg-auth-panel"><span className="wgg-gate-mark">SP</span><strong>Opening your risk workspace</strong><span>Loading the authenticated Solana workspace…</span></div></div>}><Workspace /></Suspense>;
}

function AppShell() {
  const [walletReady, setWalletReady] = useState(false);
  const [, setStatus] = useState<'starting' | 'ready' | 'error'>('starting');
  const [, setError] = useState('');

  useEffect(() => {
    let active = true;
    import('./reown').then(() => {
      if (!active) return;
      setWalletReady(true);
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
    if (!walletReady) return;
    void import('./reown').then(({ appKit }) => appKit.open({ view: 'Connect', namespace: 'solana' })).catch((cause) => {
      console.error('StockPass wallet modal failed to open', cause);
    });
  };

  return <ConnectedRoute connect={connect} />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><AppErrorBoundary><AppShell /></AppErrorBoundary></React.StrictMode>);