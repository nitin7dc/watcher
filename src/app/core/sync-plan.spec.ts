import { balanceKey, NATIVE, syncKey, type Balance, type SyncRecord } from './models';
import { describeChange, planReading, type Reading } from './sync-plan';

const W = 'w1';
const C = 'eth';
const TOKEN_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TOKEN_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const T0 = 1_000;
const NOW = 2_000;

function bal(asset: string, raw: bigint, decimals = 6): Balance {
  return { key: balanceKey(W, C, asset), walletId: W, chainId: C, asset, raw: raw.toString(), decimals, amount: Number(raw) / 10 ** decimals, updatedAt: T0 };
}

const prevSync: SyncRecord = { key: syncKey(W, C), walletId: W, chainId: C, ok: true, updatedAt: T0, lastOkAt: T0, checked: [NATIVE, TOKEN_A, TOKEN_B] };

function reading(assets: [string, bigint][], failed: string[] = []): Reading {
  return { walletId: W, chainId: C, ok: true, complete: false, assets: new Map(assets.map(([a, raw]) => [a, { raw, decimals: 6 }])), failed };
}

const known = () => new Set([`${C}:${TOKEN_A}`, `${C}:${TOKEN_B}`]);

describe('planReading', () => {
  const prev = [bal(NATIVE, 1_000_000n, 18), bal(TOKEN_A, 5_000_000n), bal(TOKEN_B, 10_000_000n)];

  it('keeps balances for failed token calls and does not mark the sync ok', () => {
    const plan = planReading(reading([[NATIVE, 1_000_000n], [TOKEN_A, 7_000_000n]], [TOKEN_B]), prev, prevSync, known(), NOW);

    expect(plan.dels).not.toContain(balanceKey(W, C, TOKEN_B));
    expect(plan.puts.map((p) => p.asset)).not.toContain(TOKEN_B);
    expect(plan.puts.find((p) => p.asset === TOKEN_A)?.raw).toBe('7000000');
    expect(plan.sync.ok).toBe(false);
    expect(plan.sync.error).toBe('1 token read failed');
    expect(plan.sync.lastOkAt).toBe(T0);
    expect(plan.sync.updatedAt).toBe(NOW);
  });

  it('clears a balance when a token read succeeds with zero, even while another token failed', () => {
    const plan = planReading(reading([[NATIVE, 1_000_000n], [TOKEN_A, 0n]], [TOKEN_B]), prev, prevSync, known(), NOW);

    expect(plan.dels).toEqual([balanceKey(W, C, TOKEN_A)]);
    expect(plan.changes).toEqual([expect.objectContaining({ asset: TOKEN_A, amount: 0, delta: -5 })]);
  });

  it('advances lastOkAt only when every token read succeeded', () => {
    const plan = planReading(reading([[NATIVE, 1_000_000n], [TOKEN_A, 5_000_000n], [TOKEN_B, 10_000_000n]]), prev, prevSync, known(), NOW);

    expect(plan.sync.ok).toBe(true);
    expect(plan.sync.error).toBeUndefined();
    expect(plan.sync.lastOkAt).toBe(NOW);
    expect(plan.puts).toEqual([]);
    expect(plan.dels).toEqual([]);
  });

  it('keeps the last good read time when the whole reading fails', () => {
    const plan = planReading({ walletId: W, chainId: C, ok: false, error: 'Endpoint unreachable', complete: false, assets: new Map() }, prev, prevSync, known(), NOW);

    expect(plan.sync).toEqual(expect.objectContaining({ ok: false, error: 'Endpoint unreachable', lastOkAt: T0 }));
    expect(plan.puts).toEqual([]);
    expect(plan.dels).toEqual([]);
  });
});

describe('describeChange', () => {
  const change = { delta: 1.5, symbol: 'ETH', usd: 4_000 };

  it('includes wallet, amount, symbol and value when privacy is off', () => {
    const n = describeChange(change, { walletLabel: 'Treasury', chainName: 'Base' }, false);
    expect(`${n.title} ${n.body}`).toContain('Treasury');
    expect(n.title).toContain('ETH');
    expect(n.body).toContain('$4,000.00');
  });

  it('reveals nothing about the position when privacy is on', () => {
    const n = describeChange(change, { walletLabel: 'Treasury', chainName: 'Base' }, true);
    const text = `${n.title} ${n.body}`;
    for (const leak of ['Treasury', 'ETH', '1.5', '$', 'Base']) expect(text).not.toContain(leak);
  });
});
