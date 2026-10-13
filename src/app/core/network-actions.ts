import { inject, Injectable } from '@angular/core';
import type { ChainDef } from './chains';
import { db } from './db';
import type { CustomChain } from './models';
import { probeRpc } from './providers/evm';
import { Store } from './store';
import { SyncService } from './sync.service';
import { assertHttpUrl } from './urls';

export interface NewChain {
  name: string;
  rpcUrl: string;
  nativeSymbol: string;
  explorer: string;
  coingeckoId: string;
  llamaSlug: string;
}

@Injectable({ providedIn: 'root' })
export class NetworkActions {
  private readonly store = inject(Store);
  private readonly sync = inject(SyncService);

  /** Measures round-trip time to an endpoint and returns the latest block or slot height. */
  async probe(chain: ChainDef, url: string): Promise<{ ms: number; height: bigint }> {
    assertHttpUrl(url);
    if (chain.family === 'evm') {
      const r = await probeRpc(url);
      if (r.chainId !== chain.evmChainId) throw new Error(`Serves chain ${r.chainId}, expected ${chain.evmChainId}`);
      return { ms: r.ms, height: r.block };
    }
    const t0 = performance.now();
    const res =
      chain.family === 'btc'
        ? await fetch(`${url.replace(/\/$/, '')}/blocks/tip/height`, { signal: AbortSignal.timeout(8_000) })
        : await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot' }),
            signal: AbortSignal.timeout(8_000),
          });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const height = chain.family === 'btc' ? BigInt((await res.text()).trim()) : BigInt(((await res.json()) as { result: number }).result);
    return { ms: Math.round(performance.now() - t0), height };
  }

  async setOverride(chainId: string, url: string | null): Promise<void> {
    if (url) {
      const chain = this.store.chainMap().get(chainId);
      if (!chain) throw new Error('Unknown chain');
      await this.probe(chain, url);
      await db.rpcOverrides.put({ chainId, url });
    } else {
      await db.rpcOverrides.delete(chainId);
    }
    void this.sync.run();
  }

  async addCustom(input: NewChain): Promise<CustomChain> {
    assertHttpUrl(input.rpcUrl);
    const { chainId } = await probeRpc(input.rpcUrl);
    const existing = this.store.chains().find((c) => c.evmChainId === chainId);
    if (existing) throw new Error(`Chain ${chainId} is already available as ${existing.name}.`);
    const chain: CustomChain = {
      id: `evm:${chainId}`,
      family: 'evm',
      name: input.name.trim() || `Chain ${chainId}`,
      nativeSymbol: input.nativeSymbol.trim().toUpperCase() || 'ETH',
      nativeDecimals: 18,
      nativePriceKey: input.coingeckoId.trim() ? `coingecko:${input.coingeckoId.trim()}` : undefined,
      llamaSlug: input.llamaSlug.trim() || undefined,
      evmChainId: chainId,
      rpcUrls: [input.rpcUrl.trim()],
      explorer: input.explorer.trim().replace(/\/$/, ''),
      color: '#6f7d78',
      custom: true,
    };
    await db.customChains.put(chain);
    return chain;
  }

  async removeCustom(id: string): Promise<void> {
    await db.transaction('rw', [db.customChains, db.wallets, db.balances, db.syncs, db.tokens, db.rpcOverrides], async () => {
      await db.customChains.delete(id);
      await db.rpcOverrides.delete(id);
      await db.balances.where('chainId').equals(id).delete();
      await db.tokens.where('chainId').equals(id).delete();
      await db.syncs.filter((s) => s.chainId === id).delete();
      await db.wallets.toCollection().modify((w) => {
        w.chains = w.chains.filter((c) => c !== id);
      });
    });
  }
}
