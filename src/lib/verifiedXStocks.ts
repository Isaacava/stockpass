export const VERIFIED_XSTOCK_SYMBOLS = [
  'AAPLx',
  'NVDAx',
  'TSLAx',
  'SPYx',
  'METAx',
  'GOOGLx',
  'COINx',
  'QQQx',
  'CRCLx',
  'MSTRx'
] as const;

export type VerifiedXStockSymbol = (typeof VERIFIED_XSTOCK_SYMBOLS)[number];

export const VERIFIED_XSTOCK_LABEL = 'Verified xStocks';

// StockPass tracks this curated Solana set in the primary Discover experience.
// Official mints are always resolved at runtime from the xStocks registry;
// this list is the product tracking allowlist, not a contract-address source of truth.
export const isVerifiedXStock = (symbol: string) =>
  VERIFIED_XSTOCK_SYMBOLS.includes(symbol as VerifiedXStockSymbol);
