import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DEFAULT_EVM_SELECTION } from '../core/chains';
import { formatUsd } from '../core/format';
import { Store } from '../core/store';
import { WalletActions } from '../core/wallet-actions';
import { ActivityList } from '../ui/activity-list';
import { Allocation } from '../ui/allocation';
import { AssetTable } from '../ui/asset-table';
import { HistoryChart } from '../ui/history-chart';
import { PctPipe, UsdPipe } from '../ui/pipes';
import { SweepDial } from '../ui/sweep-dial';

@Component({
  selector: 'app-overview',
  imports: [RouterLink, SweepDial, HistoryChart, AssetTable, Allocation, ActivityList, UsdPipe, PctPipe],
  template: `
    <div class="page">
      @if (!store.loaded()) {
        <p class="muted">Opening local database…</p>
      } @else if (!store.wallets().length) {
        <section class="panel intro">
          <div class="intro-top">
            <app-sweep-dial [size]="120" />
            <div class="intro-copy">
              <h1>Watch any wallet without connecting it</h1>
              <p>
                Paste public addresses for Ethereum and other EVM chains, Bitcoin or Solana. Watcher reads balances
                straight from public endpoints and keeps everything in this browser. It never asks for keys,
                seed phrases or signatures, and it can't move funds.
              </p>
              <div class="row">
                <a routerLink="/wallets" [queryParams]="{ add: 1 }" class="btn primary">Add wallets</a>
                <button type="button" class="btn" (click)="addSamples()" [disabled]="addingSamples()">
                  {{ addingSamples() ? 'Adding…' : 'Try with two public sample wallets' }}
                </button>
              </div>
            </div>
          </div>
        </section>
      } @else {
        <section class="panel hero">
          <div class="hero-top">
            <app-sweep-dial />
            <div class="total">
              <p class="muted">
                Net worth across {{ store.wallets().length }} {{ store.wallets().length === 1 ? 'wallet' : 'wallets' }}
                on {{ store.chainAllocation().length || store.trackedChainIds().length }}
                {{ (store.chainAllocation().length || store.trackedChainIds().length) === 1 ? 'chain' : 'chains' }}
              </p>
              <p class="figure sensitive" [attr.aria-label]="totalText()">
                <span>{{ totalParts().whole }}</span><span class="cents">{{ totalParts().cents }}</span><span class="caret" aria-hidden="true"></span>
              </p>
              <p class="change sensitive">
                @let d = store.change24h();
                @if (d !== null) {
                  <span [class.gain]="d > 0" [class.loss]="d < 0">{{ d > 0 ? '+' : '' }}{{ d | usd }} ({{ changePct() | pct }})</span>
                  <span class="muted"> in 24 hours from price moves</span>
                } @else {
                  <span class="muted">24-hour change appears once prices load</span>
                }
              </p>
            </div>
          </div>
          <app-history-chart [snapshots]="store.snapshots()" [walletIds]="store.walletIds()" />
        </section>

        <div class="cols">
          <section class="panel">
            <div class="panel-head">
              <h2>Top assets</h2>
              <a routerLink="/assets" class="meta">All {{ store.assets().length }} assets</a>
            </div>
            <app-asset-table [assets]="store.assets()" [total]="store.total()" [limit]="8" emptyText="Reading balances…" />
            @if (store.hiddenCount()) {
              <p class="muted small">
                {{ store.hiddenCount() }} small, unpriced or hidden {{ store.hiddenCount() === 1 ? 'balance is' : 'balances are' }} left out.
                <a routerLink="/settings">Change filters</a>
              </p>
            }
          </section>
          <div class="stack">
            <section class="panel">
              <h2>By chain</h2>
              <app-allocation [items]="store.chainAllocation()" />
            </section>
            <section class="panel">
              <h2>Recent changes</h2>
              <app-activity-list [items]="store.activity()" [limit]="6" />
            </section>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .hero { gap: 26px; padding: 24px; }
    .hero-top { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; }
    .total { display: grid; gap: 8px; min-width: 0; }
    .figure {
      font-size: clamp(2rem, 5.2vw, 3.9rem); line-height: 1; font-weight: 250;
      letter-spacing: -0.06em; white-space: nowrap;
    }
    .cents { font-size: 0.5em; color: var(--graphite); letter-spacing: -0.02em; margin-left: 0.06em; }
    .caret {
      display: inline-block; width: 0.42em; height: 0.82em; margin-left: 0.12em; vertical-align: -0.04em;
      background: var(--accent); box-shadow: 0 0 12px color-mix(in oklab, var(--accent) 60%, transparent);
      animation: caret 1.1s steps(2, start) infinite;
    }
    @keyframes caret { to { visibility: hidden; } }
    .change { font-size: 0.9rem; }
    .intro { padding: 32px; }
    .intro-top { display: flex; gap: 32px; align-items: center; flex-wrap: wrap; }
    .intro-copy { display: grid; gap: 14px; max-width: 62ch; }
    .intro-copy h1 { font-size: clamp(1.4rem, 3vw, 2rem); font-weight: 600; letter-spacing: -0.03em; }
    .intro-copy p { color: var(--graphite); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Overview {
  protected readonly store = inject(Store);
  private readonly wallets = inject(WalletActions);
  protected readonly addingSamples = signal(false);

  protected readonly totalText = computed(() => formatUsd(this.store.total()));
  protected readonly totalParts = computed(() => {
    const s = this.totalText();
    const i = s.lastIndexOf('.');
    return i < 0 ? { whole: s, cents: '' } : { whole: s.slice(0, i), cents: s.slice(i) };
  });
  protected readonly changePct = computed(() => {
    const d = this.store.change24h() ?? 0;
    const base = this.store.total() - d;
    return base > 0 ? (d / base) * 100 : 0;
  });

  protected async addSamples(): Promise<void> {
    this.addingSamples.set(true);
    try {
      await this.wallets.add([
        {
          address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          family: 'evm',
          label: 'vitalik.eth (sample)',
          ens: 'vitalik.eth',
          chains: DEFAULT_EVM_SELECTION,
        },
        {
          address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          family: 'btc',
          label: 'Bitcoin genesis address (sample)',
          chains: ['btc'],
        },
      ]);
    } finally {
      this.addingSamples.set(false);
    }
  }
}
