import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { useAppKitAccount } from '@reown/appkit/react';
import StockPassApp from './StockPassApp';
import Landing from './Landing';
import './styles.css';
import './mobile-safety.css';
import '@solana/wallet-adapter-react-ui/styles.css';
import './reown';

const endpoint = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('StockPass render error', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f3f6f9', color: '#101827', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ width: 'min(560px, 100%)', background: '#fff', border: '1px solid #d9e1e9', borderRadius: 16, padding: 24, boxShadow: '0 18px 55px rgba(25,39,58,.08)' }}>
            <strong style={{ display: 'block', fontSize: 18, marginBottom: 8 }}>StockPass could not render</strong>
            <p style={{ margin: 0, color: '#637083', lineHeight: 1.6 }}>The page hit a client-side error. Reloading may recover the app after a transient wallet or browser initialization issue.</p>
            <button onClick={() => window.location.reload()} style={{ marginTop: 16, border: 0, borderRadius: 9, padding: '10px 14px', background: '#2864ff', color: '#fff', fontWeight: 800 }}>Reload StockPass</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Root() {
  const { isConnected } = useAppKitAccount();
  return isConnected ? <StockPassApp /> : <Landing />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <AppErrorBoundary>
            <Root />
          </AppErrorBoundary>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </React.StrictMode>
);
