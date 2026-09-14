import { createAppKit } from '@reown/appkit/react';
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react';
import { solana } from '@reown/appkit/networks';
import { STOCKPASS_REOWN_PROJECT_ID } from './reown-hardcoded';

const solanaAdapter = new SolanaAdapter();

export const walletConnectReady = true;

createAppKit({
  adapters: [solanaAdapter],
  networks: [solana],
  projectId: STOCKPASS_REOWN_PROJECT_ID,
  metadata: {
    name: 'StockPass',
    description: 'Onchain social trading with proof-backed positions.',
    url: window.location.origin,
    icons: [`${window.location.origin}/favicon.svg`]
  },
  features: {
    analytics: false
  }
});
