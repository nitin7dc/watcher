import { formatAmount, formatUsd, toAmount } from './format';
import { balanceKey, NATIVE, syncKey, tokenKey, type Activity, type Balance, type SyncRecord, type Token } from './models';

export interface Reading {
  walletId: string;
  chainId: string;
  ok: boolean;
  error?: string;
  /** When true, assets missing from `assets` are known to be zero. */
  complete: boolean;
  /** Successful reads, including real zeros. */
  assets: Map<string, { raw: bigint; decimals: number }>;
  /** Assets that were requested but failed to read; their stored balances are left alone. */
  failed?: string[];
}

export type Change = Omit<Activity, 'symbol' | 'usd'>;

export interface ReadingPlan {
  puts: Balance[];
  dels: string[];
  sync: SyncRecord;
  changes: Change[];
  newTokens: Token[];
}

/**
 * Turns one wallet/chain reading into storage writes. `knownTokens` holds token
 * keys already stored (or queued); newly discovered ones are added to it.
 */
export function planReading(
  r: Reading,
  prevBalances: Balance[],
  prevSync: SyncRecord | undefined,
  knownTokens: Set<string>,
  now: number,
): ReadingPlan {
  const key = syncKey(r.walletId, r.chainId);
  const empty = { puts: [], dels: [], changes: [], newTokens: [] };

  if (!r.ok) {
    return {
      ...empty,
      sync: {
        key,
        walletId: r.walletId,
        chainId: r.chainId,
        ok: false,
        error: r.error,
        updatedAt: now,
        lastOkAt: prevSync?.lastOkAt,
        checked: prevSync?.checked,
      },
    };
  }

  const failed = new Set(r.failed ?? []);
  const plan: ReadingPlan = {
    puts: [],
    dels: [],
    changes: [],
    newTokens: [],
    sync: {
      key,
      walletId: r.walletId,
      chainId: r.chainId,
      ok: failed.size === 0,
      error: failed.size ? `${failed.size} token ${failed.size === 1 ? 'read' : 'reads'} failed` : undefined,
      updatedAt: now,
      lastOkAt: failed.size ? prevSync?.lastOkAt : now,
      checked: r.complete ? undefined : [...new Set([...(prevSync?.checked ?? []), ...r.assets.keys()])],
    },
  };

  const record = !!prevSync?.lastOkAt;
  const wasChecked = (asset: string) => !prevSync?.checked || prevSync.checked.includes(asset);
  const prev = new Map(prevBalances.map((b) => [b.asset, b]));
  const base = { walletId: r.walletId, chainId: r.chainId };

  for (const [asset, p] of prev) {
    if (failed.has(asset)) continue;
    const next = r.assets.get(asset)?.raw ?? (r.complete ? 0n : undefined);
    if (next === 0n) {
      plan.dels.push(p.key);
      if (record) plan.changes.push({ ...base, ts: now, asset, delta: -p.amount, amount: 0 });
    }
  }

  for (const [asset, { raw, decimals }] of r.assets) {
    if (raw === 0n) continue;
    const p = prev.get(asset);
    if (p && p.raw === raw.toString()) continue;
    const amount = toAmount(raw, decimals);
    plan.puts.push({ ...base, key: balanceKey(r.walletId, r.chainId, asset), asset, raw: raw.toString(), decimals, amount, updatedAt: now });
    if (record && (p || wasChecked(asset))) {
      plan.changes.push({ ...base, ts: now, asset, delta: amount - (p?.amount ?? 0), amount });
    }
    const tk = tokenKey(r.chainId, asset);
    if (asset !== NATIVE && !knownTokens.has(tk)) {
      knownTokens.add(tk);
      plan.newTokens.push({ key: tk, chainId: r.chainId, address: asset, symbol: '', name: '', decimals, source: 'discovered', addedAt: now });
    }
  }
  return plan;
}

export interface ChangeNotice {
  title: string;
  body: string;
}

/** Notification and toast copy for a balance change. Privacy mode reveals nothing about the position. */
export function describeChange(
  a: Pick<Activity, 'delta' | 'symbol' | 'usd'>,
  ctx: { walletLabel?: string; chainName?: string },
  privacy: boolean,
): ChangeNotice {
  if (privacy) return { title: 'A balance changed', body: 'Open Watcher to see the details.' };
  const sign = a.delta > 0 ? '+' : '−';
  return {
    title: `${ctx.walletLabel || 'Wallet'}: ${sign}${formatAmount(Math.abs(a.delta))} ${a.symbol}`,
    body: `On ${ctx.chainName ?? 'an unknown chain'}${a.usd != null ? `, about ${formatUsd(Math.abs(a.usd))}` : ''}`,
  };
}
