import { createClient } from '@supabase/supabase-js';
import { address, createNoopSigner, createSolanaRpc } from '@solana/kit';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sfbxpscbevnmoppgkjcr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const MAINNET_RPC = process.env.SOLANA_RPC_URL || '';
const KAMINO_MAIN_MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF';
const KAMINO_PROGRAM_ID = 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD';

const ACTIONS = new Set(['supply', 'deposit', 'borrow', 'repay', 'withdraw', 'close']);

type PreparedInstruction = {
  programAddress?: string;
  accounts?: Array<{ address?: string; signer?: boolean; writable?: boolean }>;
  data?: Uint8Array | number[];
};

function validAddress(value: string) {
  try {
    return String(address(value)) === value;
  } catch {
    return false;
  }
}

function json(res: any, body: unknown, status = 200) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

function b64(bytes: Uint8Array | number[] | undefined): string {
  if (!bytes) return '';
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text = '';
  const chunk = 0x8000;
  for (let i = 0; i < array.length; i += chunk) {
    text += String.fromCharCode(...array.subarray(i, i + chunk));
  }
  return btoa(text);
}

function serializeInstructions(instructions: PreparedInstruction[]) {
  return instructions.map((ix) => ({
    programAddress: String(ix.programAddress || ''),
    data: b64(ix.data),
    accounts: (ix.accounts || []).map((account) => ({
      address: String(account.address || ''),
      signer: Boolean(account.signer),
      writable: Boolean(account.writable),
    })),
  }));
}

export const config = { maxDuration: 60 };

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, { error: 'POST required' }, 405);
  if (!MAINNET_RPC) return json(res, { error: 'SOLANA_RPC_URL is not configured.' }, 503);
  if (!SUPABASE_SERVICE_ROLE_KEY) return json(res, { error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' }, 503);

  try {
    // Keep the heavy Kamino action module inside the request boundary. If a
    // transitive ESM/runtime dependency is unavailable on Vercel, return the
    // underlying exception as JSON instead of crashing the whole invocation.
    const {
      KaminoAction,
      KaminoMarket,
      PROGRAM_ID,
      VanillaObligation,
      getCurrentLedgerInstant,
      getMedianSlotDurationInMsFromLastEpochs,
    } = await import('@kamino-finance/klend-sdk');

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const wallet = typeof body.wallet === 'string' ? body.wallet.trim() : '';
    const actionType = typeof body.action === 'string' ? body.action : '';
    const obligationAddress = typeof body.obligationAddress === 'string' ? body.obligationAddress.trim() : '';
    const reserveAddress = typeof body.reserveAddress === 'string' ? body.reserveAddress.trim() : '';
    const withdrawReserveAddress = typeof body.withdrawReserveAddress === 'string' ? body.withdrawReserveAddress.trim() : '';
    const amountBaseUnits = typeof body.amountBaseUnits === 'string' ? body.amountBaseUnits : '';
    const withdrawAmountBaseUnits = typeof body.withdrawAmountBaseUnits === 'string' ? body.withdrawAmountBaseUnits : '';
    const createPosition = actionType === 'deposit' && body.createPosition === true;

    if (!validAddress(wallet)) return json(res, { error: 'Invalid wallet address.' }, 400);
    if (!ACTIONS.has(actionType)) return json(res, { error: 'Unsupported Kamino action.' }, 400);
    if (!/^\d+$/.test(amountBaseUnits) || BigInt(amountBaseUnits) <= 0n) {
      return json(res, { error: 'amountBaseUnits must be a positive unsigned integer string.' }, 400);
    }

    if (actionType === 'close') {
      if (!validAddress(obligationAddress) || !validAddress(reserveAddress) || !validAddress(withdrawReserveAddress)) {
        return json(res, { error: 'Close requires valid obligation, debt reserve and collateral reserve addresses.' }, 400);
      }
      if (!/^\d+$/.test(withdrawAmountBaseUnits) || BigInt(withdrawAmountBaseUnits) <= 0n) {
        return json(res, { error: 'withdrawAmountBaseUnits must be a positive unsigned integer string for close.' }, 400);
      }
    } else if (['deposit', 'borrow', 'repay', 'withdraw'].includes(actionType)) {
      if (!validAddress(reserveAddress)) {
        return json(res, { error: 'This Kamino action requires a valid reserve address.' }, 400);
      }
      if (!createPosition && !validAddress(obligationAddress)) {
        return json(res, { error: 'This Kamino action requires a valid obligation address.' }, 400);
      }
    } else if (actionType === 'supply') {
      if (!validAddress(reserveAddress)) return json(res, { error: 'Supply requires a valid reserve address.' }, 400);
    }

    const clientInfoHeader = req.headers['x-client-info'];
    const clientInfo = Array.isArray(clientInfoHeader) ? clientInfoHeader.join(' ') : String(clientInfoHeader || '');
    if (!/stockpass-session=[^\s]+/.test(clientInfo)) {
      return json(res, { error: 'A valid wallet session is required.' }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

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

    const rpc = createSolanaRpc(MAINNET_RPC);
    const recentSlotDurationMs = await getMedianSlotDurationInMsFromLastEpochs();
    const market = await KaminoMarket.load(rpc as never, address(KAMINO_MAIN_MARKET), recentSlotDurationMs);
    if (!market) throw new Error('Kamino Main Market could not be loaded.');
    const currentLedgerInstant = await getCurrentLedgerInstant(rpc as never, 'confirmed');

    let obligation: any = null;
    if (actionType !== 'supply' && !createPosition) {
      obligation = await market.getObligationByAddress(address(obligationAddress));
      if (!obligation) return json(res, { error: 'The selected Kamino obligation no longer exists. Refresh first.' }, 400);

      const userObligations = await market.getAllUserObligations(address(wallet), currentLedgerInstant, 'confirmed');
      const ownsObligation = (userObligations as unknown as Array<{ obligationAddress?: unknown }>).some(
        (item) => String(item.obligationAddress || '') === obligationAddress,
      );
      if (!ownsObligation) return json(res, { error: 'The selected Kamino obligation is not owned by the authenticated wallet.' }, 403);
    }

    const owner = createNoopSigner(address(wallet));
    let action: any;

    switch (actionType) {
      case 'supply':
        action = await KaminoAction.buildDepositReserveLiquidityTxns({
          kaminoMarket: market,
          currentLedgerInstant,
          amount: amountBaseUnits,
          reserveAddress: address(reserveAddress),
          owner,
          obligation: new VanillaObligation(PROGRAM_ID),
          scopeRefreshConfig: undefined,
          includeAtaIxs: true,
        });
        break;
      case 'deposit':
        action = await KaminoAction.buildDepositTxns({
          kaminoMarket: market,
          currentLedgerInstant,
          amount: amountBaseUnits,
          reserveAddress: address(reserveAddress),
          owner,
          obligation: createPosition ? new VanillaObligation(PROGRAM_ID) : obligation,
          useV2Ixs: createPosition ? false : true,
          scopeRefreshConfig: undefined,
          includeAtaIxs: createPosition,
        });
        break;
      case 'borrow':
        action = await KaminoAction.buildBorrowTxns({
          kaminoMarket: market,
          currentLedgerInstant,
          amount: amountBaseUnits,
          reserveAddress: address(reserveAddress),
          owner,
          obligation,
          useV2Ixs: true,
          scopeRefreshConfig: undefined,
        });
        break;
      case 'repay':
        action = await KaminoAction.buildRepayTxns({
          kaminoMarket: market,
          currentLedgerInstant,
          amount: amountBaseUnits,
          reserveAddress: address(reserveAddress),
          owner,
          obligation,
          useV2Ixs: true,
          scopeRefreshConfig: undefined,
        });
        break;
      case 'withdraw':
        action = await KaminoAction.buildWithdrawTxns({
          kaminoMarket: market,
          currentLedgerInstant,
          amount: amountBaseUnits,
          reserveAddress: address(reserveAddress),
          owner,
          obligation,
          useV2Ixs: true,
          scopeRefreshConfig: undefined,
        });
        break;
      case 'close':
        action = await KaminoAction.buildRepayAndWithdrawTxns({
          kaminoMarket: market,
          currentLedgerInstant,
          repayAmount: amountBaseUnits,
          repayReserveAddress: address(reserveAddress),
          withdrawAmount: withdrawAmountBaseUnits,
          withdrawReserveAddress: address(withdrawReserveAddress),
          payer: owner,
          obligation,
          useV2Ixs: true,
          scopeRefreshConfig: undefined,
        });
        break;
      default:
        throw new Error('Unsupported action.');
    }

    const instructions = serializeInstructions(
      KaminoAction.actionToIxs(action) as unknown as PreparedInstruction[],
    );

    const recordResult = await supabase.from('wgg_platform_actions').insert({
      wallet,
      action_type: actionType,
      obligation_address: obligationAddress || null,
      reserve_address: reserveAddress || null,
      withdraw_reserve_address: withdrawReserveAddress || null,
      amount_base_units: amountBaseUnits,
      withdraw_amount_base_units: actionType === 'close' ? withdrawAmountBaseUnits : null,
      status: 'prepared',
      kamino_program_id: KAMINO_PROGRAM_ID,
      metadata: { instructionCount: instructions.length, lookupTables: action.luts.map(String), preparedInstructions: instructions, createsPosition: createPosition },
    }).select('id').single();

    if (recordResult.error || !recordResult.data?.id) {
      throw new Error(recordResult.error?.message || 'Could not record the prepared platform action.');
    }

    return json(res, {
      actionId: recordResult.data.id,
      action: actionType,
      wallet,
      instructions,
      lookupTables: action.luts.map(String),
      amountBaseUnits,
      withdrawAmountBaseUnits: actionType === 'close' ? withdrawAmountBaseUnits : undefined,
    });
  } catch (error) {
    console.error('kamino-actions-prepare', error);
    return json(res, { error: error instanceof Error ? error.message : 'Kamino action preparation failed.' }, 502);
  }
}
