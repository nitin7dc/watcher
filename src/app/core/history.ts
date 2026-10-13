import type { Snapshot } from './models';

export interface Series {
  points: { ts: number; totalUsd: number }[];
  /** Current wallets summed in every point. */
  walletIds: string[];
}

/**
 * A comparable value series over the wallets tracked now. Each point sums only
 * the current wallets present in every plotted snapshot, so a wallet added (or
 * first read) partway through never shows up as growth, removed wallets drop out,
 * and wallets that have never been read are ignored rather than required.
 */
export function comparableSeries(snapshots: Snapshot[], currentIds: string[]): Series {
  const current = new Set(currentIds);
  const candidates = snapshots.filter((s) => s.wallets && Object.keys(s.wallets).some((id) => current.has(id)));
  if (!candidates.length) return { points: [], walletIds: [] };

  let included = new Set(Object.keys(candidates[0].wallets!).filter((id) => current.has(id)));
  for (const s of candidates.slice(1)) {
    included = new Set([...included].filter((id) => s.wallets![id] !== undefined));
  }
  if (!included.size) return { points: [], walletIds: [] };

  const ids = [...included];
  return {
    walletIds: ids,
    points: candidates.map((s) => ({ ts: s.ts, totalUsd: ids.reduce((sum, id) => sum + s.wallets![id], 0) })),
  };
}
