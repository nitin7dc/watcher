import { inject, Injectable } from '@angular/core';
import Dexie from 'dexie';
import { BACKUP_APP, sanitizeBackup, type Backup } from './backup';
import { DB_NAME, db } from './db';
import { LEASE_KEY, LEGACY_LEASE_KEY } from './leader';
import { Store } from './store';
import { SyncService } from './sync.service';

const CHANNEL = 'watcher-control';

@Injectable({ providedIn: 'root' })
export class DataActions {
  private readonly store = inject(Store);
  private readonly sync = inject(SyncService);
  private readonly channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;

  constructor() {
    this.channel?.addEventListener('message', (e) => {
      if (e.data === 'destroying') {
        this.sync.stop();
        db.close();
      }
      if (e.data === 'destroyed') location.replace(document.baseURI);
    });
  }

  async exportBackup(): Promise<void> {
    const [wallets, tokens, customChains, rpcOverrides] = await Promise.all([
      db.wallets.toArray(),
      db.tokens.filter((t) => t.source === 'custom' || !!t.hidden).toArray(),
      db.customChains.toArray(),
      db.rpcOverrides.toArray(),
    ]);
    const backup: Backup = {
      app: BACKUP_APP,
      version: 1,
      exportedAt: new Date().toISOString(),
      wallets,
      tokens,
      customChains,
      rpcOverrides,
      settings: this.store.settings(),
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `watcher-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1_000);
  }

  /** Merges a backup into the current data. Existing wallets are kept; invalid rows are skipped. */
  async importBackup(file: File): Promise<{ wallets: number; tokens: number }> {
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      throw new Error('That file is not valid JSON.');
    }
    const clean = sanitizeBackup(raw, await db.wallets.toArray());
    await db.transaction('rw', [db.wallets, db.tokens, db.customChains, db.rpcOverrides, db.settings], async () => {
      await db.customChains.bulkPut(clean.customChains);
      await db.rpcOverrides.bulkPut(clean.rpcOverrides);
      await db.tokens.bulkPut(clean.tokens);
      await db.wallets.bulkPut(clean.wallets);
      if (Object.keys(clean.settings).length) {
        await db.settings.put({ key: 'app', value: { ...this.store.settings(), ...clean.settings } });
      }
    });
    void this.sync.run();
    return { wallets: clean.wallets.length, tokens: clean.tokens.length };
  }

  async clearHistory(): Promise<void> {
    await Promise.all([db.snapshots.clear(), db.activity.clear()]);
  }

  /**
   * Deletes Watcher's own database (wallets, tokens, settings, balances, history)
   * and its sync lease, then reloads every open Watcher tab. Other data on the
   * same origin is left alone.
   */
  async destroyEverything(): Promise<void> {
    this.channel?.postMessage('destroying');
    this.sync.stop();
    db.close();
    await Dexie.delete(DB_NAME).catch(() => undefined);
    localStorage.removeItem(LEASE_KEY);
    localStorage.removeItem(LEGACY_LEASE_KEY);
    this.channel?.postMessage('destroyed');
    location.replace(document.baseURI);
  }
}
