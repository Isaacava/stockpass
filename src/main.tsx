import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import './mobile-safety.css';

const WeekendGapGuardWorkspace = lazy(() => import('./WeekendGapGuardWorkspace'));

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('StockPass render error', error, info); }
  render() {
    if (this.state.error) {
      const message = this.state.error?.message || 'Unknown client-side error';
      return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: '#f2eee5', color: '#171717', fontFamily: 'DM Sans, system-ui, sans-serif' }}><div style={{ width: 'min(680px, 100%)', background: '#fffdf8', border: '1px solid #d7d0c3', padding: 24, boxShadow: '8px 8px 0 #d8d0c2' }}><strong style={{ display: 'block', fontSize: 20, marginBottom: 8 }}>StockPass could not render</strong><p style={{ margin: 0, color: '#716b62', lineHeight: 1.6 }}>The application hit a client-side rendering error.</p><pre style={{ margin: '16px 0 0', padding: 13, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#111211', color: '#f7f2e9', font: '12px/1.55 monospace' }}>{message}</pre><button onClick={() => window.location.reload()} style={{ marginTop: 16, border: 0, padding: '11px 14px', background: '#2f46d0', color: '#fff', fontWeight: 800 }}>Reload StockPass</button></div></div>;
    }
    return this.props.children;
  }
}

function BootError({ label, error }: { label: string; error: Error }) {
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: '#f2eee5', color: '#171717', fontFamily: 'DM Sans, system-ui, sans-serif' }}><div style={{ width: 'min(720px, 100%)', background: '#fffdf8', border: '1px solid #d7d0c3', padding: 24, boxShadow: '8px 8px 0 #d8d0c2' }}><div style={{ font: '700 9px/1 monospace', letterSpacing: '.12em', color: '#c74b30' }}>{label}</div><h1 style={{ margin: '14px 0 8px', font: '800 34px/.95 Syne, sans-serif', letterSpacing: '-.04em' }}>StockPass startup failed.</h1><p style={{ margin: 0, color: '#716b62', lineHeight: 1.65 }}>The app is now surfacing the browser-side error instead of rendering a blank screen.</p><pre style={{ margin: '16px 0 0', padding: 13, background: '#111211', color: '#f7f2e9', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', font: '12px/1.55 monospace' }}>{error.message}{error.stack ? `\n\n${error.stack}` : ''}</pre><button onClick={() => window.location.reload()} style={{ marginTop: 16, border: 0, padding: '11px 14px', background: '#111211', color: '#fffdf8', fontWeight: 800 }}>Retry</button></div></div>;
}

function Loading() {
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f2eee5', color: '#171717', fontFamily: 'DM Sans, system-ui, sans-serif' }}><div style={{ textAlign: 'center' }}><div style={{ width: 42, height: 42, margin: '0 auto 14px', display: 'grid', placeItems: 'center', background: '#111211', color: '#fffdf8', font: '800 11px/1 monospace' }}>SP</div><strong style={{ display: 'block', fontSize: 16 }}>Opening StockPass</strong><span style={{ display: 'block', marginTop: 6, color: '#716b62', fontSize: 12 }}>Starting the Solana wallet connection layer…</span></div></div>;
}

function App() {
  return <Suspense fallback={<Loading />}><WeekendGapGuardWorkspace /></Suspense>;
}

async function bootstrap() {
  let walletSetupError: Error | null = null;
  try {
    await import('./reown');
  } catch (error) {
    walletSetupError = error instanceof Error ? error : new Error(String(error));
    console.error('StockPass wallet connector initialization failed', error);
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AppErrorBoundary>
        {walletSetupError ? <BootError label="WALLET CONNECTOR / INIT ERROR" error={walletSetupError} /> : <App />}
      </AppErrorBoundary>
    </React.StrictMode>,
  );
}

void bootstrap().catch((error) => {
  const root = document.getElementById('root');
  if (root) root.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;padding:20px;background:#f2eee5;color:#171717;font-family:system-ui,sans-serif"><div style="max-width:720px;background:#fffdf8;border:1px solid #d7d0c3;padding:24px;box-shadow:8px 8px 0 #d8d0c2"><strong style="font-size:20px">StockPass could not start</strong><pre style="margin-top:14px;padding:13px;background:#111211;color:#fffdf8;white-space:pre-wrap;word-break:break-word">${String(error instanceof Error ? error.stack || error.message : error)}</pre></div></div>`;
});