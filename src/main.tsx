import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import App from './App';
import './styles.css';
import '@solana/wallet-adapter-react-ui/styles.css';

const endpoint = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </React.StrictMode>
);
