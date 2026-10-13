import type { Price } from '../models';

const API = 'https://coins.llama.fi';
const CHUNK = 60;

interface LlamaCoin {
  price: number;
  symbol?: string;
  decimals?: number;
  confidence?: number;
}

export async function fetchPrices(keys: string[]): Promise<Price[]> {
  const unique = [...new Set(keys)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += CHUNK) chunks.push(unique.slice(i, i + CHUNK));

  const now = Date.now();
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const list = chunk.join(',');
      const [current, change] = await Promise.all([
        getJson<{ coins: Record<string, LlamaCoin> }>(`${API}/prices/current/${list}?searchWidth=6h`),
        getJson<{ coins: Record<string, number> }>(`${API}/percentage/${list}?period=24h`).catch(
          () => ({ coins: {} as Record<string, number> }),
        ),
      ]);
      return Object.entries(current.coins).map(
        ([key, c]): Price => ({
          key,
          price: c.price,
          symbol: c.symbol,
          change24h: change.coins[key],
          updatedAt: now,
        }),
      );
    }),
  );
  return results.flat();
}

/** Price + symbol lookup for a single coin key; used when adding a token. */
export async function lookupCoin(key: string): Promise<LlamaCoin | null> {
  const res = await getJson<{ coins: Record<string, LlamaCoin> }>(
    `${API}/prices/current/${key}`,
  );
  return res.coins[key] ?? null;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Price API HTTP ${res.status}`);
  return (await res.json()) as T;
}
