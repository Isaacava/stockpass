export type StockAsset = {
  symbol: string;
  name: string;
  icon: string;
  mint: string;
  source: 'xStocks' | 'demo';
};

// The registry may not have resolved an official mint yet. Use an empty string rather than
// `undefined` so strict TypeScript never widens downstream alert/proof records unexpectedly.
const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

export const STOCKS: StockAsset[] = [
  { symbol: 'AAPLx', name: 'Apple', icon: 'AAPL', mint: viteEnv.VITE_AAPLX_MINT ?? '', source: 'xStocks' },
  { symbol: 'NVDAx', name: 'NVIDIA', icon: 'NVDA', mint: viteEnv.VITE_NVDAX_MINT ?? '', source: 'xStocks' },
  { symbol: 'TSLAx', name: 'Tesla', icon: 'TSLA', mint: viteEnv.VITE_TSLAX_MINT ?? '', source: 'xStocks' },
  { symbol: 'SPYx', name: 'S&P 500 ETF', icon: 'SPY', mint: viteEnv.VITE_SPYX_MINT ?? '', source: 'xStocks' },
  { symbol: 'MSFTx', name: 'Microsoft', icon: 'MSFT', mint: viteEnv.VITE_MSFTX_MINT ?? '', source: 'xStocks' },
  { symbol: 'METAx', name: 'Meta', icon: 'META', mint: viteEnv.VITE_METAX_MINT ?? '', source: 'xStocks' }
];
