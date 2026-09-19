import { address, createNoopSigner, createSolanaRpc } from '@solana/kit';
import {
  KaminoAction,
  KaminoMarket,
  getCurrentLedgerInstant,
  getMedianSlotDurationInMsFromLastEpochs,
} from '@kamino-finance/klend-sdk';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sfbxpscbevnmoppgkjcr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_eCgd2QEH5mUlEK5vHIonyw_v0E8QFrp';
const MAINNET_RPC =
  process.env.SOLANA_RPC_URL ||
  process.env.VITE_SOLANA_RPC_URL ||
  'https://api.mainnet-beta.solana.com';
const KAMINO_MAIN_MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF';

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
    programAddress: String(ix.programAddress ?? ''),
    data: b64(ix.data),
    accounts: (ix.accounts ?? []).map((account) => ({
      address: String(account.address ?? ''),
      signer: Boolean(account.signer),
      writable: Boolean(account.writable),
    })),
  }));
}

function json(res: any, body: unknown, status = 200) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

export const config = {
  maxDuration: 60,
};

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, { error: 'POST required' }, 405);

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
    const wallet = typeof body.wallet === 'string' ? body.wallet.trim() : '';
    const obligationAddress = typeof body.obligationAddress === 'string' ? body.obligationAddress.trim() : '';
    const reserveAddress = typeof body.reserveAddress === 'string' ? body.reserveAddress.trim() : '';
    const amountBaseUnits = typeof body.amountBaseUnits === 'string' ? body.amountBaseUnits : '';
    const targetLtvPct = typeof body.targetLtvPct === 'number' ? body.targetLtvPct : Number(body.targetLtvPct);
    const kind = body.kind === 'repay' || body.kind === 'deposit' ? body.kind : '';

    if (!validAddress(wallet) || !validAddress(obligationAddress) || !validAddress(reserveAddress)) {
      return json(res, { error: 'Invalid Solana address in protection request.' }, 400);
    }
    if (!kind) return json(res, { error: 'kind must be repay or deposit.' }, 400);
    if (kind === 'deposit' && !/^\d+$/.test(amountBaseUnits)) {
      return json(res, { error: 'amountBaseUnits must be an unsigned integer string for deposits.' }, 400);
    }
    if (kind === 'repay' && (!Number.isFinite(targetLtvPct) || targetLtvPct <= 0 || targetLtvPct >= 100)) {
      return json(res, { error: 'A valid targetLtvPct between 0 and 100 is required for repay.' }, 400);
    }

    const clientInfoHeader = req.headers['x-client-info'];
    const clientInfo = Array.isArray(clientInfoHeader)
      ? clientInfoHeader.join(' ')
      : String(clientInfoHeader ?? '');
    if (!/stockpass-session=[^\s]+/.test(clientInfo)) {
      return json(res, { error: 'A valid wallet session is required.' }, 401);
    }

    const authResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/wallet-auth`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: SUPABASE_PUBLISHABLE_KEY,
          'x-client-info': clientInfo,
        },
        body: JSON.stringify({ action: 'validate', wallet }),
      },
    );

    if (!authResponse.ok) {
      const authBody = await authResponse.json().catch(() => null);
      return json(res, { error: authBody?.error ?? 'Wallet session is invalid or expired.' }, 401);
    }

    const rpc = createSolanaRpc(MAINNET_RPC);
    const recentSlotDurationMs = await getMedianSlotDurationInMsFromLastEpochs();
    const market = await KaminoMarket.load(
      rpc as never,
      address(KAMINO_MAIN_MARKET),
      recentSlotDurationMs,
    );
    if (!market) throw new Error('Kamino Main Market could not be loaded.');

    const currentLedgerInstant = await getCurrentLedgerInstant(rpc as never, 'confirmed');
    const userObligations = await market.getAllUserObligations(
      address(wallet),
      currentLedgerInstant,
      'confirmed',
    );

    const ownsObligation = (userObligations as unknown as Array<{ obligationAddress?: unknown }>).some(
      (obligation) => String(obligation.obligationAddress ?? '') === obligationAddress,
    );
    if (!ownsObligation) {
      return json(res, { error: 'The selected Kamino obligation is not owned by the authenticated wallet.' }, 403);
    }

    const obligation = await market.getObligationByAddress(address(obligationAddress));
    if (!obligation) throw new Error('The Kamino obligation no longer exists. Refresh before preparing protection.');

    let preparedAmountBaseUnits = amountBaseUnits;
    let repayUsd = 0;
    if (kind === 'repay') {
      const reserve = market.getExistingReserveByAddress(address(reserveAddress));
      if (!reserve) return json(res, { error: 'The selected debt reserve is no longer present in Kamino.' }, 400);

      const debt = (obligation.borrows ?? []).find(
        (borrow: any) => String(borrow.reserveAddress ?? '') === reserveAddress,
      );
      if (!debt) return json(res, { error: 'The selected reserve is not currently borrowed by this obligation.' }, 400);

      const collateralUsd = Number(obligation.refreshedStats?.userTotalDeposit?.toNumber?.() ?? 0);
      const borrowUsd = Number(obligation.refreshedStats?.userTotalBorrow?.toNumber?.() ?? 0);
      if (!Number.isFinite(collateralUsd) || collateralUsd <= 0 || !Number.isFinite(borrowUsd) || borrowUsd <= 0) {
        return json(res, { error: 'Kamino did not return usable current collateral/debt values. Refresh and try again.' }, 400);
      }

      repayUsd = Math.max(0, borrowUsd - collateralUsd * (targetLtvPct / 100));
      const oraclePrice = Number(reserve.getOracleMarketPrice().toString());
      const mintDecimals = Number(reserve.getMintDecimals());
      if (!Number.isFinite(oraclePrice) || oraclePrice <= 0 || !Number.isFinite(mintDecimals) || mintDecimals < 0 || mintDecimals > 18) {
        return json(res, { error: 'The selected debt reserve has no usable live oracle price/decimals.' }, 400);
      }

      const currentDebtAmount = Number(
        String((debt as any).amount ?? (debt as any).scaledAmount ?? 0),
      );
      if (repayUsd <= 0) {
        return json(res, { error: 'Current state is already at or below the requested target LTV.' }, 400);
      }

      const estimatedTokens = repayUsd / oraclePrice;
      const estimatedBaseUnits = Math.ceil(estimatedTokens * 10 ** mintDecimals);
      const currentBaseUnits = Math.floor(currentDebtAmount * 10 ** mintDecimals);
      if (!Number.isFinite(estimatedBaseUnits) || estimatedBaseUnits <= 0) {
        return json(res, { error: 'Calculated repay amount is not usable.' }, 400);
      }
      const cappedBaseUnits = Math.min(estimatedBaseUnits, Math.max(1, currentBaseUnits));
      preparedAmountBaseUnits = String(cappedBaseUnits);
    }

    const owner = createNoopSigner(address(wallet));
    const action = kind === 'repay'
      ? await KaminoAction.buildRepayTxns({
          kaminoMarket: market,
          amount: preparedAmountBaseUnits,
          reserveAddress: address(reserveAddress),
          owner,
          obligation,
          useV2Ixs: true,
          scopeRefreshConfig: undefined,
          currentLedgerInstant,
        })
      : await KaminoAction.buildDepositTxns({
          kaminoMarket: market,
          amount: amountBaseUnits,
          reserveAddress: address(reserveAddress),
          owner,
          obligation,
          useV2Ixs: true,
          scopeRefreshConfig: undefined,
          currentLedgerInstant,
        });

    const instructions = serializeInstructions(
      KaminoAction.actionToIxs(action) as unknown as PreparedInstruction[],
    );

    return json(res, {
      kind,
      wallet,
      obligationAddress,
      reserveAddress,
      amountBaseUnits: preparedAmountBaseUnits,
      repayUsd: kind === 'repay' ? repayUsd : undefined,
      targetLtvPct: kind === 'repay' ? targetLtvPct : undefined,
      instructions,
      lookupTables: action.luts.map(String),
    });
  } catch (error) {
    console.error('wgg-protection-prepare', error);
    return json(
      res,
      { error: error instanceof Error ? error.message : 'Protection preparation failed.' },
      502,
    );
  }
}
