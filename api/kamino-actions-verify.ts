import {
  actualInstructionFingerprint,
  expectedInstructionFingerprint,
  verifyPreparedKaminoInstructionSet,
} from '../src/lib/kaminoActionVerification.js';
const KAMINO_MAIN_MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF';

import { discoverKaminoXStockPositions } from '../src/lib/kamino';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sfbxpscbevnmoppgkjcr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const MAINNET_RPC = process.env.SOLANA_RPC_URL || '';
const KAMINO_PROGRAM_ID = 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD';

function json(res: any, body: unknown, status = 200) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

async function loadConfirmedTransaction(connection: any, signature: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
      encoding: 'json',
    });
    if (tx) return tx;
    await new Promise((resolve) => setTimeout(resolve, 900 * (attempt + 1)));
  }
  return null;
}

export const config = { runtime: 'nodejs', maxDuration: 60 };

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, { error: 'POST required' }, 405);
  if (!MAINNET_RPC) return json(res, { error: 'SOLANA_RPC_URL is not configured.' }, 503);
  if (!SUPABASE_SERVICE_ROLE_KEY) return json(res, { error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' }, 503);

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const { Connection } = await import('@solana/web3.js');
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const wallet = typeof body.wallet === 'string' ? body.wallet.trim() : '';
    const actionId = typeof body.actionId === 'string' ? body.actionId.trim() : '';
    const signature = typeof body.signature === 'string' ? body.signature.trim() : '';
    if (!wallet || !actionId || !signature) return json(res, { error: 'wallet, actionId and signature are required.' }, 400);

    const clientInfoHeader = req.headers['x-client-info'];
    const clientInfo = Array.isArray(clientInfoHeader) ? clientInfoHeader.join(' ') : String(clientInfoHeader || '');
    if (!/stockpass-session=[^\s]+/.test(clientInfo)) {
      return json(res, { error: 'A valid wallet session is required.' }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const rowResult = await supabase
      .from('wgg_platform_actions')
      .select('*')
      .eq('id', actionId)
      .eq('wallet', wallet)
      .single();
    if (rowResult.error || !rowResult.data) {
      return json(res, { error: 'Prepared platform action was not found.' }, 404);
    }

    const authResponse = await fetch(SUPABASE_URL + '/functions/v1/wallet-auth', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        'x-client-info': clientInfo,
      },
      body: JSON.stringify({ action: 'validate', wallet }),
    });
    if (!authResponse.ok) {
      const authBody = await authResponse.json().catch(() => null);
      return json(res, { error: authBody?.error || 'Wallet session is invalid or expired.' }, 401);
    }

    const row = rowResult.data;
    if (row.status === 'confirmed' && row.transaction_signature === signature) {
      return json(res, { verified: true, actionId, signature, monitoring: 'already_synced' });
    }
    if (row.status !== 'prepared' && row.status !== 'submitted') {
      return json(res, { error: 'Action is no longer verifiable from status ' + row.status + '.' }, 409);
    }

    const connection = new Connection(MAINNET_RPC, 'confirmed');
    const tx = await loadConfirmedTransaction(connection, signature);
    if (!tx || tx.meta?.err) {
      return json(res, { error: 'Transaction is not confirmed successfully on mainnet.' }, 409);
    }

    const message = tx.transaction.message as any;
    const accountKeys: string[] = (message.accountKeys ?? []).map((key: unknown) => String(key));
    const requiredSignerCount = Number(message.header?.numRequiredSignatures ?? 0);
    const signerPresent = accountKeys.slice(0, requiredSignerCount).includes(wallet);

    const actualInstructions = (message.instructions ?? []).map((instruction: any) => actualInstructionFingerprint({
      programId: accountKeys[Number(instruction.programIdIndex)],
      accounts: (instruction.accounts ?? []).map((index: number) => accountKeys[index]),
      data: String(instruction.data ?? ''),
    }));
    const actualKaminoPresent = actualInstructions.some((instruction) => instruction.programId === KAMINO_PROGRAM_ID);

    const preparedMetadata = row.metadata && typeof row.metadata === 'object'
      ? row.metadata as { preparedInstructions?: unknown }
      : null;
    const preparedInstructions = Array.isArray(preparedMetadata?.preparedInstructions)
      ? preparedMetadata.preparedInstructions.map((instruction: unknown) => expectedInstructionFingerprint(instruction as { programAddress: string; accounts: Array<{ address: string }>; data: string }))
      : [];

    if (!signerPresent || !actualKaminoPresent) {
      return json(res, { error: 'Confirmed transaction does not contain the authenticated wallet signer and expected Kamino program activity.' }, 422);
    }

    if (!verifyPreparedKaminoInstructionSet(actualInstructions, preparedInstructions)) {
      return json(res, { error: 'Confirmed transaction differs from the complete set of instructions StockPass prepared.' }, 422);
    }

    const updateResult = await supabase
      .from('wgg_platform_actions')
      .update({
        status: 'confirmed',
        transaction_signature: signature,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', actionId)
      .eq('wallet', wallet);
    if (updateResult.error) throw updateResult.error;

    let monitoringSynced = 0;
    try {
      const positions = await discoverKaminoXStockPositions(wallet, MAINNET_RPC);
      for (const position of positions) {
        for (const stock of position.xStocks) {
          const payload = {
            wallet,
            kamino_market: KAMINO_MAIN_MARKET,
            obligation_address: position.obligation,
            collateral_mint: stock.mint,
            symbol: stock.symbol,
            collateral_amount: stock.amount,
            collateral_value_usd: position.depositValueUsd,
            debt_usd: position.borrowValueUsd,
            liquidation_ltv: position.liquidationLtvPct,
            current_buffer_pct: position.liquidationBufferPct,
            risk_status: 'unknown',
            updated_at: new Date().toISOString(),
          };

          const existing = await supabase
            .from('wgg_monitored_positions')
            .select('id')
            .eq('wallet', wallet)
            .eq('obligation_address', position.obligation)
            .eq('collateral_mint', stock.mint)
            .maybeSingle();

          if (existing.data?.id) {
            await supabase.from('wgg_monitored_positions').update(payload).eq('id', existing.data.id);
          } else {
            await supabase.from('wgg_monitored_positions').insert(payload);
          }
          monitoringSynced += 1;
        }
      }
    } catch (syncError) {
      console.error('kamino-actions-verify monitoring sync', syncError);
    }

    return json(res, { verified: true, actionId, signature, monitoring: { synced: monitoringSynced } });
  } catch (error) {
    console.error('kamino-actions-verify', error);
    return json(res, { error: error instanceof Error ? error.message : 'Kamino action verification failed.' }, 502);
  }
}
