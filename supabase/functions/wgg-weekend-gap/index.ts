import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PYTH_BASE = "https://hermes.pyth.network";
const MAX_SYMBOLS = 25;
const DEFAULT_WEEKS = 13;
const MAX_WEEKS = 26;

type PythParsed = {
  id: string;
  price?: { price?: string; conf?: string; expo?: number; publish_time?: number };
  ema_price?: { price?: string; conf?: string; expo?: number; publish_time?: number };
};

type Snapshot = {
  price: number;
  publishTime: number;
  feedId: string;
};

type WeekendObservation = {
  fridayDate: string;
  nextSessionDate: string;
  fridayClose: number;
  nextOpen: number;
  gapPct: number;
  downsideGapPct: number;
};

function normalizeSymbol(value: unknown): string {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const out = new Date(date.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function isWeekday(date: Date): boolean {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

function easternOffsetMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
    year: "numeric",
  }).formatToParts(date);
  const value = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT-5";
  const match = value.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return -300;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === "+" ? minutes : -minutes;
}

function easternLocalToUtc(year: number, month: number, day: number, hour: number, minute: number): number {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = easternOffsetMinutes(guess);
  return Date.UTC(year, month - 1, day, hour, minute) - offset * 60_000;
}

function priceFromParsed(parsed?: PythParsed): { price: number; publishTime: number } | null {
  const point = parsed?.price ?? parsed?.ema_price;
  if (!point?.price || typeof point.expo !== "number" || typeof point.publish_time !== "number") return null;
  const price = Number(point.price) * 10 ** point.expo;
  return Number.isFinite(price) && price > 0 ? { price, publishTime: point.publish_time } : null;
}

async function resolveFeedId(symbol: string, apiKey: string): Promise<string | null> {
  const query = encodeURIComponent(`Equity.US.${symbol}/USD`);
  const response = await fetch(`${PYTH_BASE}/v2/price_feeds?query=${query}&asset_type=Equity&limit=20`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Pyth feed lookup ${response.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text) as Array<{ id?: string; attributes?: Record<string, string> }>;
  const exact = data.find((item) => normalizeSymbol(item.attributes?.base ?? item.attributes?.symbol ?? "") === symbol) ?? data[0];
  return exact?.id ?? null;
}

async function fetchSnapshot(feedId: string, timestamp: number, apiKey: string): Promise<Snapshot | null> {
  const url = `${PYTH_BASE}/v2/updates/price/${Math.floor(timestamp / 1000)}?ids%5B%5D=${encodeURIComponent(feedId)}&parsed=true&ignore_invalid_price_ids=true`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  const text = await response.text();
  if (!response.ok) return null;
  const result = JSON.parse(text) as { parsed?: PythParsed[] };
  const row = result.parsed?.find((item) => item.id.toLowerCase() === feedId.toLowerCase());
  const point = priceFromParsed(row);
  return point ? { ...point, feedId } : null;
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function buildWeekends(weeks: number): Array<{ friday: Date; nextSession: Date }> {
  const result: Array<{ friday: Date; nextSession: Date }> = [];
  const today = new Date();
  const anchor = addDays(today, -((today.getUTCDay() + 2) % 7));
  for (let i = 0; i < weeks; i += 1) {
    const friday = addDays(anchor, -(i * 7));
    let nextSession = addDays(friday, 3);
    while (!isWeekday(nextSession)) nextSession = addDays(nextSession, 1);
    result.push({ friday, nextSession });
  }
  return result.reverse();
}

async function sampleSessionPrice(feedId: string, date: Date, hour: number, minute: number, apiKey: string): Promise<Snapshot | null> {
  const timestamp = easternLocalToUtc(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), hour, minute);
  return fetchSnapshot(feedId, timestamp, apiKey);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST required" }), { status: 405, headers: { "Content-Type": "application/json" } });

  const apiKey = Deno.env.get("PYTH_API_KEY") ?? "";
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Pyth API key is not configured", code: "PYTH_NOT_CONFIGURED" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  try {
    const body = await req.json() as { symbols?: string[]; weeks?: number };
    const symbols = Array.from(new Set((body.symbols ?? []).map(normalizeSymbol).filter(Boolean))).slice(0, MAX_SYMBOLS);
    const weeks = Math.min(MAX_WEEKS, Math.max(4, Math.floor(Number(body.weeks ?? DEFAULT_WEEKS))));
    if (!symbols.length) return new Response(JSON.stringify({ observations: {}, summary: {} }), { headers: { "Content-Type": "application/json" } });

    const resolved = new Map<string, string>();
    for (const symbol of symbols) {
      const id = await resolveFeedId(symbol, apiKey);
      if (id) resolved.set(symbol, id);
    }

    const weekends = buildWeekends(weeks);
    const observations: Record<string, WeekendObservation[]> = {};
    const summary: Record<string, {
      sampleCount: number;
      medianGapPct: number | null;
      p75GapPct: number | null;
      p90GapPct: number | null;
      maxDownsideGapPct: number | null;
      typicalWeekendGapPct: number | null;
      windowStart: string;
      windowEnd: string;
      methodology: string;
      feedId: string;
    }> = {};

    for (const symbol of symbols) {
      const feedId = resolved.get(symbol);
      if (!feedId) continue;
      const rows: WeekendObservation[] = [];
      for (const { friday, nextSession } of weekends) {
        const fridayClose = await sampleSessionPrice(feedId, friday, 16, 0, apiKey);
        let nextOpen = await sampleSessionPrice(feedId, nextSession, 9, 30, apiKey);
        let nextSessionDate = nextSession;
        if (!nextOpen) {
          for (let offset = 1; offset <= 3 && !nextOpen; offset += 1) {
            const candidate = addDays(nextSession, offset);
            if (!isWeekday(candidate)) continue;
            nextOpen = await sampleSessionPrice(feedId, candidate, 9, 30, apiKey);
            if (nextOpen) nextSessionDate = candidate;
          }
        }
        if (!fridayClose || !nextOpen || fridayClose.price <= 0) continue;
        const gapPct = ((nextOpen.price - fridayClose.price) / fridayClose.price) * 100;
        rows.push({
          fridayDate: dateKey(friday),
          nextSessionDate: dateKey(nextSessionDate),
          fridayClose: fridayClose.price,
          nextOpen: nextOpen.price,
          gapPct,
          downsideGapPct: Math.max(0, -gapPct),
        });
      }

      observations[symbol] = rows;
      const gapSeries = rows.map((row) => row.gapPct);
      const downsideSeries = rows.map((row) => row.downsideGapPct);
      summary[symbol] = {
        sampleCount: rows.length,
        medianGapPct: percentile(gapSeries, 0.5),
        p75GapPct: percentile(gapSeries, 0.75),
        p90GapPct: percentile(gapSeries, 0.9),
        maxDownsideGapPct: downsideSeries.length ? Math.max(...downsideSeries) : null,
        typicalWeekendGapPct: downsideSeries.length ? percentile(downsideSeries, 0.75) : null,
        windowStart: dateKey(weekends[0].friday),
        windowEnd: dateKey(weekends[weekends.length - 1].nextSession),
        methodology: "Friday 16:00 America/New_York close to next available weekday 09:30 America/New_York session price; downside gap is max(0, Friday-to-next-session-open return). Typical weekend gap uses the 75th percentile of downside observations.",
        feedId,
      };
    }

    return new Response(JSON.stringify({ observations, summary, requestedWeeks: weeks }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Weekend gap request failed" }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
});
