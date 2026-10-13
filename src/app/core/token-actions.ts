import { inject, Injectable } from '@angular/core';
import { isAddress } from 'viem';
import { base58ByteLength } from './address';
import { db } from './db';
import { priceKeyFor } from './holdings';
import { tokenKey, type Token } from './models';
import { evmClient, readErc20Meta, rpcUrlsFor } from './providers/evm';
import { lookupCoin } from './providers/prices';
import { readSplMint } from './providers/sol';
import { Store } from './store';
import { SyncService } from './sync.service';

export interface TokenPreview {
  chainId: string;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  price?: number;
  existing?: Token;
}

@Injectable({ providedIn: 'root' })
export class TokenActions {
  private readonly store = inject(Store);
  private readonly sync = inject(SyncService);

  normalize(chainId: string, input: string): string {
    const chain = this.store.chainMap().get(chainId);
    const v = input.trim();
    if (chain?.family === 'evm') {
      if (!isAddress(v, { strict: false })) throw new Error('Enter a 0x contract address (40 hex characters).');
      return v.toLowerCase();
    }
    if (chain?.family === 'sol') {
      if (base58ByteLength(v) !== 32) throw new Error('Enter a Solana mint address.');
      return v;
    }
    throw new Error('Tokens can only be added on EVM chains and Solana.');
  }

  async lookup(chainId: string, input: string): Promise<TokenPreview> {
    const chain = this.store.chainMap().get(chainId);
    if (!chain) throw new Error('Unknown chain');
    const address = this.normalize(chainId, input);
    const existing = this.store.tokenMap().get(tokenKey(chainId, address));
    const pk = priceKeyFor(chain, address);
    const coin = pk ? lookupCoin(pk).catch(() => null) : Promise.resolve(null);
    const override = this.store.overrideMap().get(chainId);

    if (chain.family === 'evm') {
      let meta;
      try {
        meta = await readErc20Meta(evmClient(chain, override), address);
      } catch {
        throw new Error(`No ERC-20 token found at this address on ${chain.name}.`);
      }
      const c = await coin;
      return { chainId, address, ...meta, price: c?.price, existing };
    }

    const [{ decimals }, c] = await Promise.all([readSplMint(rpcUrlsFor(chain, override), address), coin]);
    return { chainId, address, decimals, symbol: c?.symbol ?? '', name: '', price: c?.price, existing };
  }

  async add(p: TokenPreview, symbol: string): Promise<void> {
    await db.tokens.put({
      key: tokenKey(p.chainId, p.address),
      chainId: p.chainId,
      address: p.address,
      symbol: symbol.trim() || p.symbol || '???',
      name: p.name,
      decimals: p.decimals,
      source: p.existing?.source === 'default' ? 'default' : 'custom',
      hidden: false,
      addedAt: Date.now(),
    });
    const ids = this.store.wallets().filter((w) => w.chains.includes(p.chainId)).map((w) => w.id);
    if (ids.length) void this.sync.run(ids);
  }

  setHidden(key: string, hidden: boolean): Promise<number> {
    return db.tokens.update(key, { hidden });
  }

  async remove(t: Token): Promise<void> {
    await db.transaction('rw', [db.tokens, db.balances], async () => {
      await db.tokens.delete(t.key);
      await db.balances.where('chainId').equals(t.chainId).filter((b) => b.asset === t.address).delete();
    });
  }
}
