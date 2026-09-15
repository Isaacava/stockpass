export const VERIFIED_XSTOCK_SYMBOLS = [
  'AAPLx',
  'NVDAx',
  'TSLAx',
  'SPYx',
  'MSFTx',
  'METAx',
  'QQQx',
  'AMZNx',
  'GOOGLx',
  'NFLXx',
  'MSTRx',
  'COINx',
  'PLTRx',
  'HOODx',
  'MUx',
  'SKHYx'
] as const;

export type VerifiedXStockSymbol = (typeof VERIFIED_XSTOCK_SYMBOLS)[number];

export const VERIFIED_XSTOCK_LABEL = 'Verified xStocks';

// StockPass only tracks this curated set in the primary Discover experience.
// Official mints are always resolved at runtime from the xStocks public registry;
// this list is the product allowlist, not a source of truth for contract addresses.
export const isVerifiedXStock = (symbol: string) =>
  VERIFIED_XSTOCK_SYMBOLS.includes(symbol as VerifiedXStockSymbol);
