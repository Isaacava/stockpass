import { createClient } from '@supabase/supabase-js';
import { Connection } from '@solana/web3.js';
import { discoverKaminoXStockPositions, KAMINO_MAIN_MARKET } from '../src/lib/kamino';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sfbxpscbevnmoppgkjcr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const MAINNET_RPC = process.env.SOLANA_RPC_URL || '';
const KAMINO_PROGRAM_ID = 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD';

function json(res: any, body: unknown, status = 200) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

function base58ToBase64(value: string) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  if (!value) return '';
  const bytes = [0];
  for (const char of value) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('Invalid base58 instruction data.');
    let carry = index;
    for (let i = 0; i < bytes.length; i += 1) {
      const next = bytes[i] * 58 + carry;
      bytes[i] = next & 255;
      carry = next >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 255);
      carry >>= 8;
    }
  }
  let leadingZeros = 0;
  for (let i = 0; i < value.length && value[i] === '1'; i += 1) leadingZeros += 1;
  const decoded = new Uint8Array(leadingZeros + bytes.length);
  for (let i = 0; i < bytes.length; i += 1) decoded[decoded.length - 1 - i] = bytes[i];
  return Buffer.from(decoded).toString('base64');
}

function actualInstructionFingerprint(instruction: any) {
  const programId = String(instruction.programId || '');
  const accounts = Array.isArray(instruction.accounts)
    ? instruction.accounts.map((account: any) => typeof account === 'string' ? account : String(account?.pubkey || account)).join(',')
    : '';
  const data = typeof instruction.data === 'string' ? base58ToBase64(instruction.data) : '';
  return { programId, accounts, data };
}

function expectedInstructionFingerprint(instruction: any) {
  return {
    programId: String(instruction.programAddress || ''),
    accounts: Array.isArray(instruction.accounts)
      ? instruction.accounts.map((account: any) => String(account.address || '')).join(',')
      : '',
    data: String(instruction.data || ''),
  };
}

function fingerprintsEqual(actual: any, expected: any) {
  return actual.programId === expected.programId
    && actual.accounts === expected.accounts
    && actual.data === expected.data;
}

async function loadConfirmedTransaction(connection: Connection, signature: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const tx = await connection.getParsedTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (tx) return tx;
    await new Promise((resolve) => setTimeout(resolve, 900 * (attempt + 1)));
  }
  return null;
}

export const config = { maxDuration: 60 };

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, { error: 'POST required' }, 405);
  if (!MAINNET_RPC) return json(res, { error: 'SOLANA_RPC_URL is not configured.' }, 503);
  if (!SUPABASE_SERVICE_ROLE_KEY) return json(res, { error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' }, 503);

  try {
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

    const signerPresent = tx.transaction.message.accountKeys.some(
      (key) => key.pubkey.toBase58() === wallet && key.signer,
    );
    const actualKaminoInstructions = tx.transaction.message.instructions
      .filter((instruction: any) => String(instruction.programId || '') === KAMINO_PROGRAM_ID)
      .map(actualInstructionFingerprint);

    const preparedMetadata = row.metadata && typeof row.metadata === 'object'
      ? row.metadata as { preparedInstructions?: unknown }
      : null;
    const preparedInstructions = Array.isArray(preparedMetadata?.preparedInstructions)
      ? preparedMetadata.preparedInstructions
          .filter((instruction: any) => String(instruction.programAddress || '') === KAMINO_PROGRAM_ID)
          .map(expectedInstructionFingerprint)
      : [];

    if (!signerPresent || !actualKaminoInstructions.length) {
      return json(res, { error: 'Confirmed transaction does not contain the authenticated wallet signer and expected Kamino program activity.' }, 422);
    }

    if (!preparedInstructions.length || preparedInstructions.length !== actualKaminoInstructions.length) {
      return json(res, { error: 'Confirmed transaction does not match the prepared Kamino instruction set.' }, 422);
    }

    for (let index = 0; index < preparedInstructions.length; index += 1) {
      if (!fingerprintsEqual(actualKaminoInstructions[index], preparedInstructions[index])) {
        return json(res, { error: 'Confirmed transaction differs from the instructions StockPass prepared.' }, 422);
      }
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
