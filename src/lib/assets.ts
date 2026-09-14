export type StockAsset = {
  symbol: string;
  name: string;
  icon: string;
  mint?: string;
  source: 'xStocks' | 'demo';
};

// Mint addresses are intentionally environment-configurable. Do not hard-code guessed
// addresses: verification should only be granted when an official asset registry is configured.
export const STOCKS: StockAsset[] = [
  { symbol: 'AAPLx', name: 'Apple', icon: 'AAPL', mint: import.meta.env.VITE_AAPLX_MINT, source: 'xStocks' },
  { symbol: 'NVDAx', name: 'NVIDIA', icon: 'NVDA', mint: import.meta.env.VITE_NVDAX_MINT, source: 'xStocks' },
  { symbol: 'TSLAx', name: 'Tesla', icon: 'TSLA', mint: import.meta.env.VITE_TSLAX_MINT, source: 'xStocks' },
  { symbol: 'SPYx', name: 'S&P 500 ETF', icon: 'SPY', mint: import.meta.env.VITE_SPYX_MINT, source: 'xStocks' },
  { symbol: 'MSFTx', name: 'Microsoft', icon: 'MSFT', mint: import.meta.env.VITE_MSFTX_MINT, source: 'xStocks' },
  { symbol: 'METAx', name: 'Meta', icon: 'META', mint: import.meta.env.VITE_METAX_MINT, source: 'xStocks' }
];

export const DEMO_POSTS = [
  {
    id: '1',
    handle: '@orbitcapital',
    avatar: 'OC',
    symbol: 'NVDAx',
    text: 'Still holding through the volatility. The position is onchain and the basis is visible.',
    proof: 'Verified holder',
    pnl: '+31.8%',
    age: '18m',
    likes: 42
  },
  {
    id: '2',
    handle: '@solanaalpha',
    avatar: 'SA',
    symbol: 'AAPLx',
    text: 'Trimmed the position after the move. Selling proof is attached to this post.',
    proof: 'Verified seller',
    pnl: '+14.2%',
    age: '2h',
    likes: 27
  },
  {
    id: '3',
    handle: '@chainlens',
    avatar: 'CL',
    symbol: 'TSLAx',
    text: 'Watching the next breakout. No position yet — alert is live.',
    proof: 'Watching',
    pnl: '—',
    age: '4h',
    likes: 18
  }
];

export const DEMO_PRICES: Record<string, number> = {
  AAPLx: 238.42,
  NVDAx: 176.38,
  TSLAx: 341.19,
  SPYx: 657.24,
  MSFTx: 508.17,
  METAx: 771.83
};
