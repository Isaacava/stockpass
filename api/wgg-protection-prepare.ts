import { address, createNoopSigner, createSolanaRpc } from '@solana/kit';
import {
  KaminoAction,
  KaminoMarket,
  getCurrentLedgerInstant,
  getMedianSlotDurationInMsFromLastEpochs,
} from '@kamino-finance/klend-sdk';

const SUPABASE_URL = 'https://sfbxpscbevnmoppgkjcr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_eCgd2QEH5mUlEK5vHIonyw_v0E8QFrp';
const MAINNET_RPC = 'https://api.mainnet-beta.solana.com';
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
  return Buffer.from(array).toString('base64');
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
    const kind = body.kind === 'repay' || body.kind === 'deposit' ? body.kind : '';

    if (!validAddress(wallet) || !validAddress(obligationAddress) || !validAddress(reserveAddress)) {
      return json(res, { error: 'Invalid Solana address in protection request.' }, 400);
    }
    if (!/^\d+$/.test(amountBaseUnits)) {
      return json(res, { error: 'amountBaseUnits must be an unsigned integer string.' }, 400);
    }
    if (!kind) return json(res, { error: 'kind must be repay or deposit.' }, 400);

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

    const owner = createNoopSigner(address(wallet));
    const action = kind === 'repay'
      ? await KaminoAction.buildRepayTxns({
          kaminoMarket: market,
          amount: amountBaseUnits,
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
      amountBaseUnits,
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
