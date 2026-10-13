export interface AddressStats {
  funded_txo_sum: number;
  spent_txo_sum: number;
  tx_count: number;
}

export interface BtcBalance {
  sats: bigint;
  /** Unconfirmed delta; negative while an outgoing spend sits in the mempool. */
  pendingSats: bigint;
  txCount: number;
}

/** Esplora address stats to balances. Sums are converted before subtracting so a negative delta stays valid. */
export function btcBalanceFromStats(chain: AddressStats, mempool: AddressStats): BtcBalance {
  return {
    sats: BigInt(chain.funded_txo_sum) - BigInt(chain.spent_txo_sum),
    pendingSats: BigInt(mempool.funded_txo_sum) - BigInt(mempool.spent_txo_sum),
    txCount: chain.tx_count + mempool.tx_count,
  };
}

export async function readBtcBalance(apis: string[], address: string): Promise<BtcBalance> {
  let lastErr: unknown;
  for (const api of apis) {
    try {
      const res = await fetch(`${api.replace(/\/$/, '')}/address/${address}`, {
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { chain_stats: AddressStats; mempool_stats: AddressStats };
      return btcBalanceFromStats(body.chain_stats, body.mempool_stats);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Bitcoin API unreachable');
}
