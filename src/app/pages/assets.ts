import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { groupAssets, isVisible, totalUsd } from '../core/holdings';
import { Store } from '../core/store';
import { AssetTable } from '../ui/asset-table';
import { ChainDot } from '../ui/marks';
import { UsdPipe } from '../ui/pipes';

@Component({
  selector: 'app-assets',
  imports: [AssetTable, ChainDot, UsdPipe],
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Assets</h1>
          <p>Every balance across your wallets, merged by asset. Select a row to see where it's held.</p>
        </div>
        <p class="sum sensitive">{{ total() | usd }}</p>
      </header>

      <section class="panel">
        <div class="filters">
          <label class="field search">
            <span class="sr-only">Search assets</span>
            <input type="search" placeholder="Search by symbol, name or contract" [value]="query()" (input)="query.set($any($event.target).value)" />
          </label>
          <select aria-label="Filter by wallet" [value]="walletId()" (change)="walletId.set($any($event.target).value)">
            <option value="">All wallets</option>
            @for (w of store.wallets(); track w.id) {
              <option [value]="w.id">{{ w.label }}</option>
            }
          </select>
          <label class="check small">
            <input type="checkbox" [checked]="showAll()" (change)="showAll.set($any($event.target).checked)" />
            Include small, unpriced and hidden
          </label>
        </div>
        @if (chainsInView().length > 1) {
          <div class="chip-set" role="group" aria-label="Filter by chain">
            <button type="button" class="chip" [attr.aria-pressed]="!chainId()" (click)="chainId.set('')">All chains</button>
            @for (c of chainsInView(); track c) {
              <button type="button" class="chip" [attr.aria-pressed]="chainId() === c" (click)="chainId.set(chainId() === c ? '' : c)">
                <app-chain-dot [chainId]="c" /> {{ store.chainMap().get(c)?.name }}
              </button>
            }
          </div>
        }
        <app-asset-table [assets]="assets()" [total]="total()" [emptyText]="emptyText()" />
      </section>
    </div>
  `,
  styles: `
    .sum { font-size: 1.5rem; font-weight: 260; letter-spacing: -0.05em; }
    .filters { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; }
    .search { flex: 1 1 260px; }
    select { width: auto; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Assets {
  protected readonly store = inject(Store);
  protected readonly query = signal('');
  protected readonly walletId = signal('');
  protected readonly chainId = signal('');
  protected readonly showAll = signal(false);

  private readonly base = computed(() => {
    const s = this.store.settings();
    const all = this.showAll();
    const w = this.walletId();
    return this.store.allHoldings().filter((h) => (all || isVisible(h, s)) && (!w || h.walletId === w));
  });

  protected readonly chainsInView = computed(() => [...new Set(this.base().map((h) => h.chainId))]);

  private readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const c = this.chainId();
    return this.base().filter(
      (h) =>
        (!c || h.chainId === c) &&
        (!q || h.symbol.toLowerCase().includes(q) || h.name.toLowerCase().includes(q) || h.asset.toLowerCase() === q),
    );
  });

  protected readonly assets = computed(() => groupAssets(this.filtered()));
  protected readonly total = computed(() => totalUsd(this.filtered()));
  protected readonly emptyText = computed(() =>
    this.store.wallets().length ? 'Nothing matches these filters.' : 'Add a wallet to see its assets.',
  );
}
