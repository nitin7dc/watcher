import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { BUILTIN_CHAINS, type ChainDef } from './chains';
import { db } from './db';
import { shortAddress } from './format';
import { buildHoldings, byWallet, isVisible, priceKeyFor, totalUsd } from './holdings';
import { LeaderElection } from './leader';
import { DEFAULT_SETTINGS, NATIVE, syncKey, tokenKey, type Activity, type Balance, type SyncRecord, type Token, type Wallet } from './models';
import { readBtcBalance } from './providers/btc';
import { evmClient, readEvmBalances, rpcUrlsFor } from './providers/evm';
import { fetchPrices } from './providers/prices';
import { readSolBalance } from './providers/sol';
import { Store } from './store';
import { describeChange, planReading, type Change, type Reading } from './sync-plan';
import { Toasts } from './toasts';

const SNAPSHOT_BUCKET_MS = 5 * 60_000;
const SNAPSHOT_MAX_AGE_MS = 90 * 86_400_000;
const PRICE_MISS_RETRY_MS = 6 * 60 * 60_000;
const ACTIVITY_CAP = 2_000;
const CHANNEL = 'watcher-sync';

type SyncMessage =
  | { type: 'state'; running: boolean; nextRunAt?: number; lastRunAt?: number }
  | { type: 'run'; walletIds?: string[] }
  | { type: 'hello' };

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly store = inject(Store);
  private readonly toasts = inject(Toasts);
  private readonly election = new LeaderElection();
  private readonly channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;

  /** True in the one tab that polls chains; other tabs mirror its schedule. */
  readonly leader = this.election.isLeader.asReadonly();
  readonly running = signal(false);
  readonly lastRunAt = signal<number | undefined>(undefined);
  readonly nextRunAt = signal<number | undefined>(undefined);
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  readonly blocks = signal(new Map<string, bigint>());
  /** Chains whose endpoint can't enumerate token accounts, so only known tokens are checked. */
  readonly limitedScan = signal(new Set<string>());
  readonly lastReadAt = computed(
    () => Math.max(this.lastRunAt() ?? 0, ...this.store.syncs().map((s) => s.updatedAt)) || undefined,
  );

  private timer?: ReturnType<typeof setTimeout>;
  private queued: Set<string> | 'all' | null = null;
  private started = false;
  private halted = false;
  private readonly priceMisses = new Map<string, number>();
  private readonly schedule = computed(() => {
    const s = this.store.settings();
    return { refreshSec: s.refreshSec, paused: s.paused, loaded: this.store.loaded(), leader: this.leader() };
  });

  constructor() {
    effect(() => {
      const { loaded, leader } = this.schedule();
      untracked(() => {
        if (!leader) {
          clearTimeout(this.timer);
          this.started = false;
          return;
        }
        if (!loaded || this.halted) return;
        if (!this.started) {
          this.started = true;
          if (this.paused()) this.reschedule();
          else void this.run();
        } else if (!this.running()) {
          this.reschedule();
        }
      });
    });
  }

  init(): void {
    this.channel?.addEventListener('message', (e: MessageEvent<SyncMessage>) => this.onMessage(e.data));
    this.election.start();
    this.channel?.postMessage({ type: 'hello' } satisfies SyncMessage);
    window.addEventListener('online', () => {
      this.online.set(true);
      if (this.leader() && !this.paused()) void this.run();
    });
    window.addEventListener('offline', () => this.online.set(false));
  }

  /** Permanently halts syncing for this page session (used before wiping data). */
  stop(): void {
    this.halted = true;
    clearTimeout(this.timer);
    this.nextRunAt.set(undefined);
    this.election.stop();
  }

  /**
   * Refresh everything, or only the given wallets (e.g. right after adding them).
   * This is an explicit read, so it runs even while paused. In a non-leader tab
   * the request is forwarded to the leader.
   */
  async run(walletIds?: string[]): Promise<void> {
    if (this.halted) return;
    if (!this.leader()) {
      this.channel?.postMessage({ type: 'run', walletIds } satisfies SyncMessage);
      return;
    }
    if (this.running()) {
      if (!walletIds) this.queued = 'all';
      else if (this.queued !== 'all') this.queued = new Set([...(this.queued ?? []), ...walletIds]);
      return;
    }
    clearTimeout(this.timer);
    this.setRunning(true);
    try {
      if (await this.cycle(walletIds ? new Set(walletIds) : undefined)) this.lastRunAt.set(Date.now());
    } catch (e) {
      console.error('Sync failed', e);
    } finally {
      this.setRunning(false);
      const next = this.queued;
      this.queued = null;
      if (next) void this.run(next === 'all' ? undefined : [...next]);
      else this.reschedule();
    }
  }

  private paused(): boolean {
    return this.store.settings().paused;
  }

  private onMessage(msg: SyncMessage): void {
    if (this.halted) return;
    if (msg.type === 'state' && !this.leader()) {
      this.running.set(msg.running);
      this.nextRunAt.set(msg.nextRunAt);
      if (msg.lastRunAt) this.lastRunAt.set(msg.lastRunAt);
    } else if (msg.type === 'run' && this.leader()) {
      void this.run(msg.walletIds);
    } else if (msg.type === 'hello' && this.leader()) {
      this.broadcastState();
    }
  }

  private setRunning(v: boolean): void {
    this.running.set(v);
    this.broadcastState();
  }

  private broadcastState(): void {
    if (!this.leader()) return;
    this.channel?.postMessage({
      type: 'state',
      running: this.running(),
      nextRunAt: this.nextRunAt(),
      lastRunAt: this.lastRunAt(),
    } satisfies SyncMessage);
  }

  private reschedule(): void {
    clearTimeout(this.timer);
    const { refreshSec, paused, leader } = this.schedule();
    if (paused || this.halted || !leader) {
      this.nextRunAt.set(undefined);
      this.broadcastState();
      return;
    }
    const ms = Math.max(10, refreshSec || DEFAULT_SETTINGS.refreshSec) * 1000;
    const base = this.lastRunAt() ?? Date.now();
    const at = Math.max(Date.now() + 1000, base + ms);
    this.nextRunAt.set(at);
    this.broadcastState();
    this.timer = setTimeout(() => {
      if (!this.online()) {
        this.nextRunAt.set(undefined);
        this.broadcastState();
        return;
      }
      void this.run();
    }, at - Date.now());
  }

  /** Returns false when there was nothing to read. */
  private async cycle(only?: Set<string>): Promise<boolean> {
    const [wallets, tokens, customChains, overrides, prevBalances, prevSyncs] = await Promise.all([
      db.wallets.toArray(),
      db.tokens.toArray(),
      db.customChains.toArray(),
      db.rpcOverrides.toArray(),
      db.balances.toArray(),
      db.syncs.toArray(),
    ]);
    if (!wallets.length) return false;
    const chains = new Map<string, ChainDef>([...BUILTIN_CHAINS, ...customChains].map((c) => [c.id, c]));
    const ov = new Map(overrides.map((o) => [o.chainId, o.url]));

    const jobs = new Map<string, Wallet[]>();
    for (const w of wallets) {
      if (only && !only.has(w.id)) continue;
      for (const c of w.chains) {
        if (!chains.has(c)) continue;
        jobs.set(c, [...(jobs.get(c) ?? []), w]);
      }
    }

    const readings: Reading[] = [];
    await runLimited([...jobs.entries()], 4, async ([chainId, ws]) => {
      const chain = chains.get(chainId)!;
      readings.push(...(await this.readChain(chain, ws, tokens, ov.get(chainId))));
    });

    const now = Date.now();
    const knownTokens = new Set(tokens.map((t) => t.key));
    const prevByWalletChain = groupBy(prevBalances, (b) => syncKey(b.walletId, b.chainId));
    const syncMap = new Map(prevSyncs.map((s) => [s.key, s]));
    const puts: Balance[] = [];
    const dels: string[] = [];
    const syncPuts: SyncRecord[] = [];
    const newTokens: Token[] = [];
    const changes: Change[] = [];

    for (const r of readings) {
      const sk = syncKey(r.walletId, r.chainId);
      const plan = planReading(r, prevByWalletChain.get(sk) ?? [], syncMap.get(sk), knownTokens, now);
      puts.push(...plan.puts);
      dels.push(...plan.dels);
      syncPuts.push(plan.sync);
      newTokens.push(...plan.newTokens);
      changes.push(...plan.changes);
    }

    const live = new Set((await db.wallets.toCollection().primaryKeys()) as string[]);
    await db.transaction('rw', [db.balances, db.syncs, db.tokens], async () => {
      await db.balances.bulkDelete(dels);
      await db.balances.bulkPut(puts.filter((b) => live.has(b.walletId)));
      await db.syncs.bulkPut(syncPuts.filter((s) => live.has(s.walletId)));
      if (newTokens.length) await db.tokens.bulkPut(newTokens);
    });

    await this.refreshPrices(chains);
    await this.recordActivity(changes, chains);
    await this.recordSnapshot(chains);
    return true;
  }

  private async readChain(chain: ChainDef, wallets: Wallet[], tokens: Token[], override?: string): Promise<Reading[]> {
    const urls = rpcUrlsFor(chain, override);
    const fail = (w: Wallet, e: unknown): Reading => ({ walletId: w.id, chainId: chain.id, ok: false, error: shortError(e), complete: false, assets: new Map() });

    if (chain.family === 'evm') {
      const tokenAddrs = tokens.filter((t) => t.chainId === chain.id).map((t) => t.address);
      const decimals = new Map(tokens.filter((t) => t.chainId === chain.id).map((t) => [t.address, t.decimals]));
      try {
        const res = await readEvmBalances(evmClient(chain, override), wallets.map((w) => w.address), tokenAddrs);
        if (res.block != null) this.blocks.update((m) => new Map(m).set(chain.id, res.block!));
        return wallets.map((w) => {
          const r = res.wallets.get(w.address);
          if (!r) return fail(w, new Error('No result'));
          const assets = new Map<string, { raw: bigint; decimals: number }>([[NATIVE, { raw: r.native, decimals: chain.nativeDecimals }]]);
          for (const [addr, raw] of r.tokens) assets.set(addr, { raw, decimals: decimals.get(addr) ?? 18 });
          return { walletId: w.id, chainId: chain.id, ok: true, complete: false, assets, failed: r.failed };
        });
      } catch (e) {
        return wallets.map((w) => fail(w, e));
      }
    }

    return Promise.all(
      wallets.map(async (w): Promise<Reading> => {
        try {
          if (chain.family === 'btc') {
            const b = await readBtcBalance(urls, w.address);
            return { walletId: w.id, chainId: chain.id, ok: true, complete: true, assets: new Map([[NATIVE, { raw: b.sats + b.pendingSats, decimals: 8 }]]) };
          }
          const mints = tokens.filter((t) => t.chainId === chain.id).map((t) => t.address);
          const s = await readSolBalance(urls, w.address, mints);
          if (s.complete !== !this.limitedScan().has(chain.id)) {
            this.limitedScan.update((set) => {
              const next = new Set(set);
              if (s.complete) next.delete(chain.id);
              else next.add(chain.id);
              return next;
            });
          }
          const assets = new Map<string, { raw: bigint; decimals: number }>([[NATIVE, { raw: s.lamports, decimals: 9 }]]);
          for (const [mint, t] of s.tokens) assets.set(mint, t);
          return { walletId: w.id, chainId: chain.id, ok: true, complete: s.complete, assets };
        } catch (e) {
          return fail(w, e);
        }
      }),
    );
  }

  private async refreshPrices(chains: Map<string, ChainDef>): Promise<void> {
    const [balances, wallets] = await Promise.all([db.balances.toArray(), db.wallets.toArray()]);
    const keys = new Set<string>();
    for (const w of wallets) for (const c of w.chains) {
      const k = chains.get(c)?.nativePriceKey;
      if (k) keys.add(k);
    }
    const now = Date.now();
    for (const b of balances) {
      const chain = chains.get(b.chainId);
      const k = chain && priceKeyFor(chain, b.asset);
      if (k && (this.priceMisses.get(k) ?? 0) < now) keys.add(k);
    }
    if (!keys.size) return;
    try {
      const prices = await fetchPrices([...keys]);
      const got = new Set(prices.map((p) => p.key));
      for (const k of keys) if (!got.has(k)) this.priceMisses.set(k, now + PRICE_MISS_RETRY_MS);
      await db.prices.bulkPut(prices);

      const discovered = await db.tokens.where('chainId').equals('sol').filter((t) => t.source === 'discovered' && !t.symbol).toArray();
      const bySym = new Map(prices.map((p) => [p.key, p.symbol]));
      const named = discovered
        .map((t) => ({ ...t, symbol: bySym.get(`solana:${t.address}`) ?? '' }))
        .filter((t) => t.symbol);
      if (named.length) await db.tokens.bulkPut(named);
    } catch (e) {
      console.warn('Price refresh failed', e);
    }
  }

  private async recordActivity(changes: Change[], chains: Map<string, ChainDef>): Promise<void> {
    if (!changes.length) return;
    const [tokens, prices, wallets] = await Promise.all([db.tokens.toArray(), db.prices.toArray(), db.wallets.toArray()]);
    const tm = new Map(tokens.map((t) => [t.key, t]));
    const pm = new Map(prices.map((p) => [p.key, p.price]));
    const rows: Activity[] = changes.map((c) => {
      const chain = chains.get(c.chainId)!;
      const pk = priceKeyFor(chain, c.asset);
      const price = pk ? pm.get(pk) : undefined;
      const symbol = c.asset === NATIVE ? chain.nativeSymbol : tm.get(tokenKey(c.chainId, c.asset))?.symbol || shortAddress(c.asset, 4, 4);
      return { ...c, symbol, usd: price != null ? price * c.delta : undefined };
    });
    await db.activity.bulkAdd(rows);
    const count = await db.activity.count();
    if (count > ACTIVITY_CAP) {
      const old = await db.activity.orderBy('ts').limit(count - ACTIVITY_CAP).primaryKeys();
      await db.activity.bulkDelete(old);
    }

    const settings = this.store.settings();
    const notable = rows.filter((r) => r.usd != null && Math.abs(r.usd) >= Math.max(1, settings.dustUsd));
    if (!notable.length) return;
    const wm = new Map(wallets.map((w) => [w.id, w]));
    const shown = settings.privacy ? notable.slice(0, 1) : notable.slice(0, 3);
    for (const r of shown) {
      const { title, body } = describeChange(r, { walletLabel: wm.get(r.walletId)?.label, chainName: chains.get(r.chainId)?.name }, settings.privacy);
      if (settings.notify && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, tag: settings.privacy ? 'watcher-change' : `${r.walletId}-${r.chainId}-${r.asset}` });
      } else {
        this.toasts.show(`${title}. ${body}`, settings.privacy ? 'info' : r.delta > 0 ? 'gain' : 'loss');
      }
    }
  }

  private async recordSnapshot(chains: Map<string, ChainDef>): Promise<void> {
    const [wallets, tokens, balances, prices, syncs] = await Promise.all([
      db.wallets.toArray(),
      db.tokens.toArray(),
      db.balances.toArray(),
      db.prices.toArray(),
      db.syncs.toArray(),
    ]);
    if (!wallets.length) return;
    const settings = this.store.settings();
    const holdings = buildHoldings({
      wallets,
      chains,
      tokens: new Map(tokens.map((t) => [t.key, t])),
      balances,
      prices: new Map(prices.map((p) => [p.key, p])),
    }).filter((h) => isVisible(h, settings));
    const total = totalUsd(holdings);
    const perWallet = byWallet(holdings);
    const readOnce = new Set(syncs.filter((s) => s.lastOkAt).map((s) => s.walletId));
    const values: Record<string, number> = {};
    for (const w of wallets) if (readOnce.has(w.id)) values[w.id] = perWallet.get(w.id) ?? 0;
    const now = Date.now();
    await db.transaction('rw', db.snapshots, async () => {
      await db.snapshots.where('ts').below(now - SNAPSHOT_MAX_AGE_MS).delete();
      const [last, prev] = await db.snapshots.orderBy('ts').reverse().limit(2).toArray();
      if (!last && total === 0) return;
      if (last && prev && last.ts - prev.ts < SNAPSHOT_BUCKET_MS) await db.snapshots.delete(last.ts);
      await db.snapshots.put({ ts: now, totalUsd: total, wallets: values });
    });
  }
}

function shortError(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string; details?: string };
  const msg = err?.shortMessage || err?.message || String(e);
  if (/fetch|network|HTTP request failed|Failed to fetch/i.test(msg)) return 'Endpoint unreachable';
  if (/timed? ?out/i.test(msg)) return 'Request timed out';
  if (/429|rate/i.test(msg)) return 'Rate limited by endpoint';
  return msg.split('\n')[0].slice(0, 140);
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const i of items) {
    const k = key(i);
    const arr = m.get(k);
    if (arr) arr.push(i);
    else m.set(k, [i]);
  }
  return m;
}

async function runLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}
