import { createAppKit } from '@reown/appkit/react';
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react';
import { solana } from '@reown/appkit/networks';
import { STOCKPASS_REOWN_PROJECT_ID } from './reown-hardcoded';

const solanaAdapter = new SolanaAdapter();

export const walletConnectReady = true;

createAppKit({
  adapters: [solanaAdapter],
  networks: [solana],
  defaultNetwork: solana,
  projectId: STOCKPASS_REOWN_PROJECT_ID,
  metadata: {
    name: 'StockPass',
    description: 'Weekend Gap Guard for Solana xStock collateral.',
    url: window.location.origin,
    icons: [window.location.origin + '/favicon.svg'],
  },
  enableReconnect: true,
  enableMobileFullScreen: true,
  enableWalletGuide: false,
  allWallets: 'ONLY_MOBILE',
  features: {
    analytics: false,
    email: false,
    socials: [],
    connectMethodsOrder: ['wallet'],
  },
});