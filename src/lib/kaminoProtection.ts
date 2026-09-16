import { address, createNoopSigner, createSolanaRpc } from '@solana/kit';
import {
  KaminoAction,
  KaminoMarket,
  getCurrentLedgerInstant,
  getMedianSlotDurationInMsFromLastEpochs,
} from '@kamino-finance/klend-sdk';

export const KAMINO_MAIN_MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF';

type PreparedProtectionAction = {
  kind: 'repay' | 'deposit';
  obligationAddress: string;
  reserveAddress: string;
  amountBaseUnits: string;
  instructionCount: number;
  setupInstructionCount: number;
  lendingInstructionCount: number;
  cleanupInstructionCount: number;
  lookupTableCount: number;
  action: KaminoAction;
};

async function loadMarket(rpcUrl: string) {
  const rpc = createSolanaRpc(rpcUrl);
  const recentSlotDurationMs = await getMedianSlotDurationInMsFromLastEpochs();
  const market = await KaminoMarket.load(rpc as never, address(KAMINO_MAIN_MARKET), recentSlotDurationMs);
  if (!market) throw new Error('Kamino Main Market could not be loaded.');
  return { rpc, market };
}

export async function prepareRepayProtectionAction(params: {
  wallet: string;
  rpcUrl: string;
  obligationAddress: string;
  reserveAddress: string;
  amountBaseUnits: string;
}): Promise<PreparedProtectionAction> {
  const { rpc, market } = await loadMarket(params.rpcUrl);
  const obligation = await market.getObligationByAddress(address(params.obligationAddress));
  if (!obligation) throw new Error('The selected Kamino obligation no longer exists. Refresh before preparing protection.');
  const currentLedgerInstant = await getCurrentLedgerInstant(rpc as never, 'confirmed');
  const owner = createNoopSigner(address(params.wallet));
  const action = await KaminoAction.buildRepayTxns({
    kaminoMarket: market,
    amount: params.amountBaseUnits,
    reserveAddress: address(params.reserveAddress),
    owner,
    obligation,
    useV2Ixs: true,
    scopeRefreshConfig: undefined,
    currentLedgerInstant,
  });
  const ixs = KaminoAction.actionToIxs(action);
  return {
    kind: 'repay',
    obligationAddress: params.obligationAddress,
    reserveAddress: params.reserveAddress,
    amountBaseUnits: params.amountBaseUnits,
    instructionCount: ixs.length,
    setupInstructionCount: action.setupIxs.length,
    lendingInstructionCount: action.lendingIxs.length,
    cleanupInstructionCount: action.cleanupIxs.length,
    lookupTableCount: action.luts.length,
    action,
  };
}

export async function prepareDepositProtectionAction(params: {
  wallet: string;
  rpcUrl: string;
  obligationAddress: string;
  reserveAddress: string;
  amountBaseUnits: string;
}): Promise<PreparedProtectionAction> {
  const { rpc, market } = await loadMarket(params.rpcUrl);
  const obligation = await market.getObligationByAddress(address(params.obligationAddress));
  if (!obligation) throw new Error('The selected Kamino obligation no longer exists. Refresh before preparing protection.');
  const currentLedgerInstant = await getCurrentLedgerInstant(rpc as never, 'confirmed');
  const owner = createNoopSigner(address(params.wallet));
  const action = await KaminoAction.buildDepositTxns({
    kaminoMarket: market,
    amount: params.amountBaseUnits,
    reserveAddress: address(params.reserveAddress),
    owner,
    obligation,
    useV2Ixs: true,
    scopeRefreshConfig: undefined,
    currentLedgerInstant,
  });
  const ixs = KaminoAction.actionToIxs(action);
  return {
    kind: 'deposit',
    obligationAddress: params.obligationAddress,
    reserveAddress: params.reserveAddress,
    amountBaseUnits: params.amountBaseUnits,
    instructionCount: ixs.length,
    setupInstructionCount: action.setupIxs.length,
    lendingInstructionCount: action.lendingIxs.length,
    cleanupInstructionCount: action.cleanupIxs.length,
    lookupTableCount: action.luts.length,
    action,
  };
}
