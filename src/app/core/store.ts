import { computed, Injectable, signal } from '@angular/core';
import { BUILTIN_CHAINS, type ChainDef } from './chains';
import { db } from './db';
import {
  buildHoldings,
  byChain,
  byWallet,
  change24hUsd,
  groupAssets,
  isVisible,
  totalUsd,
} from './holdings';
import { liveSignal } from './live-signal';
import { DEFAULT_SETTINGS, type Settings, type Wallet } from './models';

@Injectable({ providedIn: 'root' })
export class Store {
  private readonly pending = signal(6);
  private readonly done = () => this.pending.update((n) => Math.max(0, n - 1));
  readonly loaded = computed(() => this.pending() === 0);

  readonly wallets = liveSignal(() => db.wallets.orderBy('createdAt').toArray(), [] as Wallet[], this.done);
  readonly tokens = liveSignal(() => db.tokens.toArray(), [], this.done);
  readonly balances = liveSignal(() => db.balances.toArray(), [], this.done);
  readonly prices = liveSignal(() => db.prices.toArray(), [], this.done);
  readonly syncs = liveSignal(() => db.syncs.toArray(), []);
  readonly customChains = liveSignal(() => db.customChains.toArray(), [], this.done);
  readonly overrides = liveSignal(() => db.rpcOverrides.toArray(), []);
  readonly snapshots = liveSignal(() => db.snapshots.orderBy('ts').toArray(), []);
  readonly activity = liveSignal(() => db.activity.orderBy('ts').reverse().limit(200).toArray(), []);
  private readonly settingsRow = liveSignal(() => db.settings.get('app'), undefined, this.done);

  readonly settings = computed<Settings>(() => {
    const s = { ...DEFAULT_SETTINGS, ...this.settingsRow()?.value };
    return { ...s, refreshSec: Math.max(60, Math.round(s.refreshSec / 60) * 60) };
  });

  readonly chains = computed<ChainDef[]>(() => [...BUILTIN_CHAINS, ...this.customChains()]);
  readonly chainMap = computed(() => new Map(this.chains().map((c) => [c.id, c])));
  readonly tokenMap = computed(() => new Map(this.tokens().map((t) => [t.key, t])));
  readonly priceMap = computed(() => new Map(this.prices().map((p) => [p.key, p])));
  readonly walletMap = computed(() => new Map(this.wallets().map((w) => [w.id, w])));
  readonly overrideMap = computed(() => new Map(this.overrides().map((o) => [o.chainId, o.url])));
  readonly syncMap = computed(() => new Map(this.syncs().map((s) => [s.key, s])));

  readonly allHoldings = computed(() =>
    buildHoldings({
      wallets: this.wallets(),
      chains: this.chainMap(),
      tokens: this.tokenMap(),
      balances: this.balances(),
      prices: this.priceMap(),
    }),
  );
  readonly holdings = computed(() => {
    const s = this.settings();
    return this.allHoldings().filter((h) => isVisible(h, s));
  });
  readonly hiddenCount = computed(() => this.allHoldings().length - this.holdings().length);
  readonly assets = computed(() => groupAssets(this.holdings()));
  readonly total = computed(() => totalUsd(this.holdings()));
  /** USD move over 24h, or null when no priced holding has a 24h change to report. */
  readonly change24h = computed(() => {
    const h = this.holdings();
    return h.some((x) => x.usd != null && x.change24h != null) ? change24hUsd(h) : null;
  });
  readonly chainAllocation = computed(() => byChain(this.holdings()));
  readonly walletTotals = computed(() => byWallet(this.holdings()));
  readonly walletIds = computed(() => this.wallets().map((w) => w.id));
  readonly trackedChainIds = computed(() => [...new Set(this.wallets().flatMap((w) => w.chains))]);
  readonly failingSyncs = computed(() => this.syncs().filter((s) => !s.ok && this.walletMap().get(s.walletId)?.chains.includes(s.chainId)));

  async updateSettings(patch: Partial<Settings>): Promise<void> {
    await db.settings.put({ key: 'app', value: { ...this.settings(), ...patch } });
  }
}
