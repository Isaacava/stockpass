import { createAppKit } from '@reown/appkit/react';
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react';
import { solana } from '@reown/appkit/networks';

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID as string | undefined;
const solanaAdapter = new SolanaAdapter();

export const walletConnectReady = Boolean(projectId);

if (projectId) {
  createAppKit({
    adapters: [solanaAdapter],
    networks: [solana],
    projectId,
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
}
