import type { ChainDef } from './chains';
import { NATIVE, type Balance, type Price, type Settings, type Token, type TokenSource, type Wallet } from './models';

export interface Holding {
  key: string;
  walletId: string;
  chainId: string;
  asset: string;
  symbol: string;
  name: string;
  amount: number;
  price?: number;
  usd?: number;
  change24h?: number;
  source: 'native' | TokenSource;
  hidden: boolean;
}

export interface HoldingsInput {
  wallets: Wallet[];
  chains: Map<string, ChainDef>;
  tokens: Map<string, Token>;
  balances: Balance[];
  prices: Map<string, Price>;
}

export function priceKeyFor(chain: ChainDef, asset: string): string | undefined {
  if (asset === NATIVE) return chain.nativePriceKey;
  return chain.llamaSlug ? `${chain.llamaSlug}:${asset}` : undefined;
}

export function buildHoldings({ wallets, chains, tokens, balances, prices }: HoldingsInput): Holding[] {
  const tracked = new Map(wallets.map((w) => [w.id, new Set(w.chains)]));
  const out: Holding[] = [];
  for (const b of balances) {
    const chain = chains.get(b.chainId);
    if (!chain || !tracked.get(b.walletId)?.has(b.chainId) || b.amount === 0) continue;
    const token = b.asset === NATIVE ? undefined : tokens.get(`${b.chainId}:${b.asset}`);
    const pk = priceKeyFor(chain, b.asset);
    const p = pk ? prices.get(pk) : undefined;
    out.push({
      key: b.key,
      walletId: b.walletId,
      chainId: b.chainId,
      asset: b.asset,
      symbol: b.asset === NATIVE ? chain.nativeSymbol : token?.symbol || p?.symbol || '???',
      name: b.asset === NATIVE ? chain.name : token?.name || '',
      amount: b.amount,
      price: p?.price,
      usd: p ? p.price * b.amount : undefined,
      change24h: p?.change24h,
      source: b.asset === NATIVE ? 'native' : (token?.source ?? 'discovered'),
      hidden: !!token?.hidden,
    });
  }
  return out;
}

export function isVisible(h: Holding, s: Pick<Settings, 'hideDust' | 'dustUsd' | 'hideUnpriced'>): boolean {
  if (h.hidden) return false;
  if (h.usd == null) return !s.hideUnpriced || h.source !== 'discovered';
  return !(s.hideDust && h.usd < s.dustUsd);
}

export interface AssetGroup {
  id: string;
  symbol: string;
  name: string;
  amount: number;
  usd?: number;
  price?: number;
  change24h?: number;
  chains: string[];
  walletIds: string[];
  holdings: Holding[];
}

/**
 * Groups holdings across wallets and chains. Priced native and built-in catalog
 * assets merge by symbol (USDC on Base + USDC on Ethereum). Everything else,
 * including priced custom or discovered tokens, stays per chain and contract so
 * a look-alike ticker never inflates a real asset.
 */
export function assetGroupId(h: Pick<Holding, 'usd' | 'source' | 'symbol' | 'chainId' | 'asset'>): string {
  const mergeable = h.usd != null && (h.source === 'native' || h.source === 'default');
  return mergeable ? `sym:${h.symbol.toUpperCase()}` : `asset:${h.chainId}:${h.asset}`;
}

export function groupAssets(holdings: Holding[]): AssetGroup[] {
  const groups = new Map<string, AssetGroup>();
  for (const h of holdings) {
    const id = assetGroupId(h);
    let g = groups.get(id);
    if (!g) {
      g = { id, symbol: h.symbol, name: h.name, amount: 0, chains: [], walletIds: [], holdings: [] };
      groups.set(id, g);
    }
    g.amount += h.amount;
    if (h.usd != null) g.usd = (g.usd ?? 0) + h.usd;
    if (!g.chains.includes(h.chainId)) g.chains.push(h.chainId);
    if (!g.walletIds.includes(h.walletId)) g.walletIds.push(h.walletId);
    if (h.source === 'native' || !g.name) g.name = h.name || g.name;
    g.holdings.push(h);
  }
  for (const g of groups.values()) {
    if (g.usd != null && g.amount > 0) g.price = g.usd / g.amount;
    const weighted = g.holdings.filter((h) => h.usd != null && h.change24h != null);
    const w = weighted.reduce((s, h) => s + h.usd!, 0);
    if (w > 0) g.change24h = weighted.reduce((s, h) => s + h.usd! * h.change24h!, 0) / w;
    g.holdings.sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1) || b.amount - a.amount);
  }
  return [...groups.values()].sort(compareValue);
}

export function compareValue(a: { usd?: number; amount: number }, b: { usd?: number; amount: number }) {
  return (b.usd ?? -1) - (a.usd ?? -1) || b.amount - a.amount;
}

export function totalUsd(holdings: Holding[]): number {
  return holdings.reduce((s, h) => s + (h.usd ?? 0), 0);
}

/** Absolute USD move over 24h implied by each asset's percentage change. */
export function change24hUsd(holdings: Holding[]): number {
  return holdings.reduce((s, h) => {
    if (h.usd == null || h.change24h == null) return s;
    return s + h.usd - h.usd / (1 + h.change24h / 100);
  }, 0);
}

export function byChain(holdings: Holding[]): { chainId: string; usd: number }[] {
  const m = new Map<string, number>();
  for (const h of holdings) if (h.usd) m.set(h.chainId, (m.get(h.chainId) ?? 0) + h.usd);
  return [...m.entries()].map(([chainId, usd]) => ({ chainId, usd })).sort((a, b) => b.usd - a.usd);
}

export function byWallet(holdings: Holding[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const h of holdings) m.set(h.walletId, (m.get(h.walletId) ?? 0) + (h.usd ?? 0));
  return m;
}
