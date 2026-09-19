
const MAIN_MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF';

function json(res: any, body: unknown, status = 200) {
  res.status(status).setHeader('Cache-Control', 'public, max-age=30, s-maxage=30').json(body);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return json(res, { error: 'GET required' }, 405);

  const rpcUrl = process.env.SOLANA_RPC_URL || '';
  if (!rpcUrl) return json(res, { error: 'SOLANA_RPC_URL is not configured.' }, 503);

  try {
    const { address, createSolanaRpc } = await import('@solana/kit');
    const { KaminoMarket, getMedianSlotDurationInMsFromLastEpochs } = await import('@kamino-finance/klend-sdk');
    const rpc = createSolanaRpc(rpcUrl);
    const recentSlotDurationMs = await getMedianSlotDurationInMsFromLastEpochs();
    const market = await KaminoMarket.load(rpc as never, address(MAIN_MARKET), recentSlotDurationMs);
    if (!market) throw new Error('Kamino Main Market could not be loaded.');

    const reserves = Array.from(market.reservesActive.values())
      .map((reserve) => ({
        address: String(reserve.address),
        symbol: reserve.symbol || 'Unknown',
        mint: String(reserve.getLiquidityMint()),
        decimals: Number(reserve.getMintDecimals()),
        oraclePrice: Number(reserve.getOracleMarketPrice().toString()),
      }))
      .filter((reserve) =>
        reserve.address &&
        reserve.mint &&
        Number.isFinite(reserve.decimals) &&
        reserve.decimals >= 0 &&
        reserve.decimals <= 18,
      )
      .sort((a, b) => a.symbol.localeCompare(b.symbol));

    return json(res, { market: MAIN_MARKET, reserves });
  } catch (error) {
    console.error('kamino-market', error);
    return json(res, { error: error instanceof Error ? error.message : 'Kamino market lookup failed.' }, 502);
  }
}
