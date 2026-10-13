import { comparableSeries } from './history';
import type { Snapshot } from './models';

const snap = (ts: number, wallets: Record<string, number>): Snapshot => ({
  ts,
  totalUsd: Object.values(wallets).reduce((a, b) => a + b, 0),
  wallets,
});

describe('comparableSeries', () => {
  it('sums every current wallet when all are present', () => {
    const s = comparableSeries([snap(1, { a: 10, b: 5 }), snap(2, { a: 12, b: 6 })], ['a', 'b']);
    expect(s.points).toEqual([
      { ts: 1, totalUsd: 15 },
      { ts: 2, totalUsd: 18 },
    ]);
    expect(s.walletIds.sort()).toEqual(['a', 'b']);
  });

  it('keeps older snapshots and leaves a newly added wallet out instead of showing growth', () => {
    const s = comparableSeries([snap(1, { a: 10 }), snap(2, { a: 11 }), snap(3, { a: 12, b: 1_000 })], ['a', 'b']);
    expect(s.points).toEqual([
      { ts: 1, totalUsd: 10 },
      { ts: 2, totalUsd: 11 },
      { ts: 3, totalUsd: 12 },
    ]);
    expect(s.walletIds).toEqual(['a']);
  });

  it('ignores a current wallet that has never been read', () => {
    const s = comparableSeries([snap(1, { a: 10 }), snap(2, { a: 11 })], ['a', 'never-read']);
    expect(s.points.map((p) => p.totalUsd)).toEqual([10, 11]);
    expect(s.walletIds).toEqual(['a']);
  });

  it('drops a wallet that is no longer tracked from every point', () => {
    const s = comparableSeries([snap(1, { a: 10, gone: 500 }), snap(2, { a: 11, gone: 600 })], ['a']);
    expect(s.points.map((p) => p.totalUsd)).toEqual([10, 11]);
  });

  it('returns nothing when no snapshot mentions a current wallet', () => {
    expect(comparableSeries([snap(1, { gone: 5 }), { ts: 2, totalUsd: 9 }], ['a']).points).toEqual([]);
  });
});
