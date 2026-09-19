import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { address, createNoopSigner, createSolanaRpc } from "npm:@solana/kit";
import {
  KaminoAction,
  KaminoMarket,
  getCurrentLedgerInstant,
  getMedianSlotDurationInMsFromLastEpochs,
} from "npm:@kamino-finance/klend-sdk@12.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAINNET_RPC = "https://api.mainnet-beta.solana.com";
const KAMINO_MAIN_MARKET = "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase function environment.");

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type RawInstruction = {
  programAddress?: string;
  accounts?: Array<{ address?: string; signer?: boolean; writable?: boolean }>;
  data?: Uint8Array | number[];
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function b64(bytes: Uint8Array | number[] | undefined): string {
  if (!bytes) return "";
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text = "";
  const chunk = 0x8000;
  for (let i = 0; i < array.length; i += chunk) {
    text += String.fromCharCode(...array.subarray(i, i + chunk));
  }
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

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clientInfoToken(req: Request) {
  const clientInfo = req.headers.get("x-client-info") ?? "";
  const match = clientInfo.match(/(?:^|\s)stockpass-session=([^\s]+)/);
  return match?.[1] ?? "";
}

async function authenticate(req: Request, wallet: string) {
  const token = clientInfoToken(req);
  if (!token || !wallet) return false;
  const tokenHash = await sha256(token);
  const { data, error } = await admin
    .from("stockpass_wallet_auth_sessions")
    .select("wallet,expires_at")
    .eq("token_hash", tokenHash)
    .eq("wallet", wallet)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  return !error && Boolean(data);
}

function validWallet(wallet: string) {
  try {
    return String(address(wallet)) === wallet;
  } catch {
    return false;
  }
}

async function loadPreparedAction(input: {
  wallet: string;
  obligationAddress: string;
  reserveAddress: string;
  amountBaseUnits: string;
  kind: "repay" | "deposit";
}) {
  if (!input.wallet || !input.obligationAddress || !input.reserveAddress || !input.amountBaseUnits) {
    throw new Error("wallet, obligationAddress, reserveAddress and amountBaseUnits are required");
  }
  if (!/^\d+$/.test(input.amountBaseUnits)) throw new Error("amountBaseUnits must be an unsigned integer string");
  if (!validWallet(input.wallet) || !validWallet(input.obligationAddress) || !validWallet(input.reserveAddress)) {
    throw new Error("Invalid Solana address in protection request.");
  }

  const rpc = createSolanaRpc(MAINNET_RPC);
  const recentSlotDurationMs = await getMedianSlotDurationInMsFromLastEpochs();
  const market = await KaminoMarket.load(rpc as never, address(KAMINO_MAIN_MARKET), recentSlotDurationMs);
  if (!market) throw new Error("Kamino Main Market could not be loaded.");

  const currentLedgerInstant = await getCurrentLedgerInstant(rpc as never, "confirmed");
  const userObligations = await market.getAllUserObligations(address(input.wallet), currentLedgerInstant, "confirmed");
  const ownsObligation = (userObligations as unknown as Array<{ obligationAddress?: unknown }>).some(
    (obligation) => String(obligation.obligationAddress ?? "") === input.obligationAddress,
  );
  if (!ownsObligation) throw new Error("The selected Kamino obligation is not owned by the authenticated wallet.");

  const obligation = await market.getObligationByAddress(address(input.obligationAddress));
  if (!obligation) throw new Error("The Kamino obligation no longer exists. Refresh before preparing protection.");

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

  const instructions = serializeInstructions(
    KaminoAction.actionToIxs(action) as unknown as RawInstruction[],
  );

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  try {
    const body = await req.json() as {
      wallet?: string;
      obligationAddress?: string;
      reserveAddress?: string;
      amountBaseUnits?: string;
      kind?: "repay" | "deposit";
    };

    const wallet = body.wallet?.trim() ?? "";
    const kind = body.kind;
    if (kind !== "repay" && kind !== "deposit") return json({ error: "kind must be repay or deposit" }, 400);
    if (!validWallet(wallet)) return json({ error: "A valid Solana wallet address is required." }, 400);

    if (!(await authenticate(req, wallet))) {
      return json({ error: "A valid wallet session is required." }, 401);
    }

    const result = await loadPreparedAction({
      wallet,
      obligationAddress: body.obligationAddress ?? "",
      reserveAddress: body.reserveAddress ?? "",
      amountBaseUnits: body.amountBaseUnits ?? "",
      kind,
    });

    return json(result);
  } catch (error) {
    console.error("wgg-protection-prepare failed", error);
    return json({
      error: error instanceof Error ? error.message : "Kamino protection preparation failed",
    }, 502);
  }
});
