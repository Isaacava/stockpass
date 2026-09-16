import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { address, createNoopSigner, createSolanaRpc } from "@solana/kit";
import {
  KaminoAction,
  KaminoMarket,
  getCurrentLedgerInstant,
  getMedianSlotDurationInMsFromLastEpochs,
} from "npm:@kamino-finance/klend-sdk@12.0.0";

const KAMINO_MAIN_MARKET = "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF";

type RawInstruction = {
  programAddress?: string;
  accounts?: Array<{ address?: string; role?: string; signer?: boolean; writable?: boolean }>;
  data?: Uint8Array | number[];
};

function b64(bytes: Uint8Array | number[] | undefined): string {
  if (!bytes) return "";
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text = "";
  const chunk = 0x8000;
  for (let i = 0; i < array.length; i += chunk) text += String.fromCharCode(...array.subarray(i, i + chunk));
  return btoa(text);
}

function serializeInstructions(instructions: RawInstruction[]) {
  return instructions.map((ix) => ({
    programAddress: String(ix.programAddress ?? ""),
    data: b64(ix.data),
    accounts: (ix.accounts ?? []).map((account) => ({
      address: String(account.address ?? ""),
      signer: Boolean(account.signer),
      writable: Boolean(account.writable),
    })),
  }));
}

async function loadAction(input: {
  wallet: string;
  obligationAddress: string;
  reserveAddress: string;
  amountBaseUnits: string;
  kind: "repay" | "deposit";
  rpcUrl: string;
}) {
  if (!input.wallet || !input.obligationAddress || !input.reserveAddress || !input.amountBaseUnits) {
    throw new Error("wallet, obligationAddress, reserveAddress and amountBaseUnits are required");
  }
  if (!/^\d+$/.test(input.amountBaseUnits)) throw new Error("amountBaseUnits must be an unsigned integer string");

  const rpc = createSolanaRpc(input.rpcUrl || "https://api.mainnet-beta.solana.com");
  const recentSlotDurationMs = await getMedianSlotDurationInMsFromLastEpochs();
  const market = await KaminoMarket.load(rpc as never, address(KAMINO_MAIN_MARKET), recentSlotDurationMs);
  if (!market) throw new Error("Kamino Main Market could not be loaded.");
  const obligation = await market.getObligationByAddress(address(input.obligationAddress));
  if (!obligation) throw new Error("The Kamino obligation no longer exists. Refresh before preparing protection.");
  const currentLedgerInstant = await getCurrentLedgerInstant(rpc as never, "confirmed");
  const owner = createNoopSigner(address(input.wallet));

  const action = input.kind === "repay"
    ? await KaminoAction.buildRepayTxns({
        kaminoMarket: market,
        amount: input.amountBaseUnits,
        reserveAddress: address(input.reserveAddress),
        owner,
        obligation,
        useV2Ixs: true,
        scopeRefreshConfig: undefined,
        currentLedgerInstant,
      })
    : await KaminoAction.buildDepositTxns({
        kaminoMarket: market,
        amount: input.amountBaseUnits,
        reserveAddress: address(input.reserveAddress),
        owner,
        obligation,
        useV2Ixs: true,
        scopeRefreshConfig: undefined,
        currentLedgerInstant,
      });

  const instructions = serializeInstructions(KaminoAction.actionToIxs(action) as unknown as RawInstruction[]);

  return {
    kind: input.kind,
    wallet: input.wallet,
    obligationAddress: input.obligationAddress,
    reserveAddress: input.reserveAddress,
    amountBaseUnits: input.amountBaseUnits,
    instructions,
    lookupTables: action.luts.map(String),
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  try {
    const body = await req.json() as {
      wallet?: string;
      obligationAddress?: string;
      reserveAddress?: string;
      amountBaseUnits?: string;
      kind?: "repay" | "deposit";
      rpcUrl?: string;
    };
    if (body.kind !== "repay" && body.kind !== "deposit") throw new Error("kind must be repay or deposit");

    const result = await loadAction({
      wallet: body.wallet ?? "",
      obligationAddress: body.obligationAddress ?? "",
      reserveAddress: body.reserveAddress ?? "",
      amountBaseUnits: body.amountBaseUnits ?? "",
      kind: body.kind,
      rpcUrl: body.rpcUrl ?? "https://api.mainnet-beta.solana.com",
    });

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Kamino protection preparation failed",
    }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
});
