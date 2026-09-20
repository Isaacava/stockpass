import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Pyth Core was upgraded on 2026-08-26. Use the upgraded Hermes service and authenticate with the server-side API key.
const PYTH_BASE = "https://pyth.dourolabs.app/hermes";
const DEFAULT_FEEDS: Record<string, string> = {};

type PythParsed = {
  id: string;
  price?: { price?: string; conf?: string; expo?: number; publish_time?: number };
  ema_price?: { price?: string; conf?: string; expo?: number; publish_time?: number };
};

function normalizeSymbol(value: unknown): string {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function priceFromParsed(parsed?: PythParsed) {
  const point = parsed?.price ?? parsed?.ema_price;
  if (!point?.price || typeof point.expo !== "number") return null;
  const price = Number(point.price) * 10 ** point.expo;
  return Number.isFinite(price)
    ? { price, confidence: point.conf ? Number(point.conf) * 10 ** point.expo : null, publishTime: point.publish_time ?? null }
    : null;
}

async function fetchJson(url: string, apiKey: string) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Pyth ${response.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as { parsed?: PythParsed[] };
}

async function resolveFeedId(symbol: string, apiKey: string) {
  const normalized = normalizeSymbol(symbol);
  if (DEFAULT_FEEDS[normalized]) return DEFAULT_FEEDS[normalized];
  const query = encodeURIComponent(`Equity.US.${normalized}/USD`);
  const response = await fetch(`${PYTH_BASE}/v2/price_feeds?query=${query}&asset_type=Equity&limit=20`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Pyth feed lookup ${response.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text) as Array<{ id?: string; attributes?: Record<string, string> }>;
  const exact = data.find((item) => {
    const fields = item.attributes ?? {};
    return normalizeSymbol(fields.base ?? fields.symbol ?? "") === normalized;
  }) ?? data[0];
  return exact?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST required" }), { status: 405, headers: { "Content-Type": "application/json" } });

  const apiKey = Deno.env.get("PYTH_API_KEY") ?? "";
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Pyth API key is not configured", code: "PYTH_NOT_CONFIGURED" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  try {
    const body = await req.json() as { symbols?: string[] };
    const symbols = Array.from(new Set((body.symbols ?? []).map(normalizeSymbol).filter(Boolean))).slice(0, 25);
    if (!symbols.length) return new Response(JSON.stringify({ prices: {} }), { headers: { "Content-Type": "application/json" } });

    const resolved = await Promise.all(symbols.map(async (symbol) => [symbol, await resolveFeedId(symbol, apiKey)] as const));
    const ids = resolved.map(([, id]) => id).filter((id): id is string => Boolean(id));
    if (!ids.length) return new Response(JSON.stringify({ prices: {}, unresolved: symbols }), { headers: { "Content-Type": "application/json" } });

    const params = ids.map((id) => `ids%5B%5D=${encodeURIComponent(id)}`).join("&");
    const latest = Math.floor(Date.now() / 1000);
    const result = await fetchJson(`${PYTH_BASE}/v2/updates/price/${latest}?${params}&parsed=true&ignore_invalid_price_ids=true`, apiKey);
    const byId = new Map((result.parsed ?? []).map((row) => [row.id.toLowerCase(), priceFromParsed(row)]));

    const prices: Record<string, { price: number; confidence: number | null; publishTime: number | null; feedId: string }> = {};
    for (const [symbol, id] of resolved) {
      if (!id) continue;
      const point = byId.get(id.toLowerCase());
      if (point) prices[symbol] = { ...point, feedId: id };
    }

    return new Response(JSON.stringify({ prices, unresolved: symbols.filter((symbol) => !prices[symbol]) }), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=5" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Pyth request failed" }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
});
