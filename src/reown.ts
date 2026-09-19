import { createAppKit } from '@reown/appkit/react';
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react';
import { solana } from '@reown/appkit/networks';
import { REOWN_PROJECT_ID } from './config';

const solanaAdapter = new SolanaAdapter();

export const appKit = createAppKit({
  adapters: [solanaAdapter],
  networks: [solana],
  defaultNetwork: solana,
  projectId: REOWN_PROJECT_ID,
  metadata: {
    name: 'StockPass',
    description: 'Weekend Gap Guard for Solana xStock collateral.',
    url: window.location.origin,
    icons: [window.location.origin + '/favicon.svg'],
  },
  features: {
    analytics: false,
    email: false,
    socials: [],
    swaps: false,
    onramp: false,
  },
  allWallets: 'SHOW',
});