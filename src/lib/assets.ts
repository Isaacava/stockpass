export type StockAsset = {
  symbol: string;
  name: string;
  icon: string;
  mint?: string;
  source: 'xStocks' | 'demo';
};

// Mint addresses remain optional here because the official registry resolves them at runtime.
// Verification is only granted after the resolved registry provides an official mint.
export const STOCKS: StockAsset[] = [
  { symbol: 'AAPLx', name: 'Apple', icon: 'AAPL', mint: import.meta.env.VITE_AAPLX_MINT, source: 'xStocks' },
  { symbol: 'NVDAx', name: 'NVIDIA', icon: 'NVDA', mint: import.meta.env.VITE_NVDAX_MINT, source: 'xStocks' },
  { symbol: 'TSLAx', name: 'Tesla', icon: 'TSLA', mint: import.meta.env.VITE_TSLAX_MINT, source: 'xStocks' },
  { symbol: 'SPYx', name: 'S&P 500 ETF', icon: 'SPY', mint: import.meta.env.VITE_SPYX_MINT, source: 'xStocks' },
  { symbol: 'MSFTx', name: 'Microsoft', icon: 'MSFT', mint: import.meta.env.VITE_MSFTX_MINT, source: 'xStocks' },
  { symbol: 'METAx', name: 'Meta', icon: 'META', mint: import.meta.env.VITE_METAX_MINT, source: 'xStocks' }
];
