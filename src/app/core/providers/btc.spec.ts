import { btcBalanceFromStats } from './btc';

const stats = (funded: number, spent: number, txs = 1) => ({ funded_txo_sum: funded, spent_txo_sum: spent, tx_count: txs });

describe('btcBalanceFromStats', () => {
  it('reads a normal confirmed balance with nothing pending', () => {
    const b = btcBalanceFromStats(stats(250_000, 50_000, 3), stats(0, 0, 0));
    expect(b.sats).toBe(200_000n);
    expect(b.pendingSats).toBe(0n);
    expect(b.txCount).toBe(3);
  });

  it('accepts a negative mempool delta from an unconfirmed outgoing spend', () => {
    const b = btcBalanceFromStats(stats(100_000, 0), stats(0, 40_000));
    expect(b.sats).toBe(100_000n);
    expect(b.pendingSats).toBe(-40_000n);
    expect(b.sats + b.pendingSats).toBe(60_000n);
  });
});
