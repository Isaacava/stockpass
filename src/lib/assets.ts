export type StockAsset = {
  symbol: string;
  name: string;
  icon: string;
  mint: string;
  source: 'xStocks' | 'demo';
};

// This file is imported both by the Vite frontend bundle AND, transitively via
// lib/kamino.ts, by several api/*.ts Vercel serverless functions
// (wgg-kamino-positions, wgg-monitor, kamino-actions-verify). `import.meta.env`
// is a Vite-build-time replacement -- it does not exist in the plain Node.js
// runtime those serverless functions execute in. There, `import.meta.env` was
// `undefined`, so `import.meta.env.VITE_AAPLX_MINT` threw
// "Cannot read properties of undefined (reading 'VITE_AAPLX_MINT')" the
// instant this module was evaluated, breaking every mint address for every
// xStock, on the server, every time -- i.e. every real position-discovery
// call. Untested by `tsc --noEmit` because api/**/*.ts isn't in
// tsconfig.json's checked "include" set, and untested in the browser because
// Vite happily resolves import.meta.env there.
//
// envVar() reads the same variable name from process.env first (what a
// Vercel serverless function actually has -- Vercel does not restrict
// server-side env vars by the VITE_ prefix, that prefix only controls what
// Vite exposes to the browser) and falls back to import.meta.env
// for the Vite-bundled frontend, where process is not defined.
function envVar(key: string): string {
  if (typeof process !== 'undefined' && process?.env && typeof process.env[key] === 'string') {
    return process.env[key] as string;
  }
  return (import.meta as unknown as { env?: Record<string, string | undefined> })?.env?.[key] ?? '';
}

// The registry may not have resolved an official mint yet. Use an empty string rather than
// `undefined` so strict TypeScript never widens downstream alert/proof records unexpectedly.
export const STOCKS: StockAsset[] = [
  { symbol: 'AAPLx', name: 'Apple', icon: 'AAPL', mint: envVar('VITE_AAPLX_MINT'), source: 'xStocks' },
  { symbol: 'NVDAx', name: 'NVIDIA', icon: 'NVDA', mint: envVar('VITE_NVDAX_MINT'), source: 'xStocks' },
  { symbol: 'TSLAx', name: 'Tesla', icon: 'TSLA', mint: envVar('VITE_TSLAX_MINT'), source: 'xStocks' },
  { symbol: 'SPYx', name: 'S&P 500 ETF', icon: 'SPY', mint: envVar('VITE_SPYX_MINT'), source: 'xStocks' },
  { symbol: 'MSFTx', name: 'Microsoft', icon: 'MSFT', mint: envVar('VITE_MSFTX_MINT'), source: 'xStocks' },
  { symbol: 'METAx', name: 'Meta', icon: 'META', mint: envVar('VITE_METAX_MINT'), source: 'xStocks' }
];
