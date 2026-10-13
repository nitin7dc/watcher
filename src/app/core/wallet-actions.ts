import { inject, Injectable } from '@angular/core';
import { BUILTIN_CHAINS, type ChainFamily } from './chains';
import { db } from './db';
import type { Wallet } from './models';
import { evmClient, hasActivity, resolveEns, reverseEns } from './providers/evm';
import { Store } from './store';
import { SyncService } from './sync.service';

export interface NewWallet {
  address: string;
  family: ChainFamily;
  label: string;
  chains: string[];
  ens?: string;
}

const MAINNET = BUILTIN_CHAINS.find((c) => c.id === 'eth')!;

@Injectable({ providedIn: 'root' })
export class WalletActions {
  private readonly store = inject(Store);
  private readonly sync = inject(SyncService);

  private mainnet() {
    return evmClient(MAINNET, this.store.overrideMap().get('eth'));
  }

  resolveEns(name: string): Promise<string | null> {
    return resolveEns(this.mainnet(), name);
  }

  reverseEns(address: string): Promise<string | null> {
    return reverseEns(this.mainnet(), address);
  }

  /** EVM chains on which the address has a nonce or balance. */
  async detectChains(address: string): Promise<string[]> {
    const evm = this.store.chains().filter((c) => c.family === 'evm');
    const found = await Promise.all(
      evm.map(async (c) => {
        try {
          return (await withTimeout(hasActivity(evmClient(c, this.store.overrideMap().get(c.id)), address), 10_000)) ? c.id : null;
        } catch {
          return null;
        }
      }),
    );
    return found.filter((id): id is string => !!id);
  }

  /** Adds wallets, skipping ones already tracked. Returns how many were added. */
  async add(entries: NewWallet[]): Promise<{ added: Wallet[]; skipped: number }> {
    const existing = await db.wallets.toArray();
    const seen = new Set(existing.map((w) => keyOf(w.family, w.address)));
    const now = Date.now();
    const added: Wallet[] = [];
    for (const [i, e] of entries.entries()) {
      const k = keyOf(e.family, e.address);
      if (seen.has(k) || !e.chains.length) continue;
      seen.add(k);
      added.push({
        id: crypto.randomUUID(),
        address: e.address,
        family: e.family,
        label: e.label.trim() || e.ens || defaultLabel(e.family, existing.length + added.length + 1),
        ens: e.ens,
        chains: e.chains,
        createdAt: now + i,
      });
    }
    if (added.length) {
      await db.wallets.bulkAdd(added);
      void this.sync.run(added.map((w) => w.id));
      void this.fillEnsLabels(added);
    }
    return { added, skipped: entries.length - added.length };
  }

  async update(id: string, patch: Partial<Pick<Wallet, 'label' | 'chains'>>): Promise<void> {
    const w = await db.wallets.get(id);
    if (!w) return;
    await db.wallets.update(id, patch);
    if (patch.chains) {
      const removed = w.chains.filter((c) => !patch.chains!.includes(c));
      if (removed.length) {
        await db.balances.where('walletId').equals(id).filter((b) => removed.includes(b.chainId)).delete();
        await db.syncs.where('walletId').equals(id).filter((s) => removed.includes(s.chainId)).delete();
      }
      if (patch.chains.some((c) => !w.chains.includes(c))) void this.sync.run([id]);
    }
  }

  async remove(id: string): Promise<void> {
    await db.transaction('rw', [db.wallets, db.balances, db.syncs, db.activity], async () => {
      await db.wallets.delete(id);
      await db.balances.where('walletId').equals(id).delete();
      await db.syncs.where('walletId').equals(id).delete();
      await db.activity.where('walletId').equals(id).delete();
    });
  }

  private async fillEnsLabels(wallets: Wallet[]): Promise<void> {
    for (const w of wallets) {
      if (w.family !== 'evm' || w.ens || !/^Wallet \d+$/.test(w.label)) continue;
      const name = await this.reverseEns(w.address);
      if (name) await db.wallets.update(w.id, { ens: name, label: name });
    }
  }
}

const keyOf = (family: ChainFamily, address: string) => `${family}:${family === 'sol' ? address : address.toLowerCase()}`;

function defaultLabel(family: ChainFamily, n: number): string {
  return family === 'btc' ? `Bitcoin ${n}` : family === 'sol' ? `Solana ${n}` : `Wallet ${n}`;
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('Timed out')), ms))]);
}
