import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { Store } from '../core/store';
import { Clock } from '../ui/clock';
import { ChainDots } from '../ui/marks';
import { AgoPipe, ShortPipe, UsdPipe } from '../ui/pipes';
import { AddWallets } from './add-wallets';

@Component({
  selector: 'app-wallets',
  imports: [RouterLink, AddWallets, ChainDots, UsdPipe, ShortPipe, AgoPipe],
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Wallets</h1>
          <p>Watch-only. Addresses are stored in this browser and only sent to the public endpoints that report their balances.</p>
        </div>
        @if (!adding()) {
          <button type="button" class="btn primary" (click)="setAdding(true)">Add wallets</button>
        }
      </header>

      @if (adding()) {
        <app-add-wallets (closed)="setAdding(false)" />
      }

      <section class="panel">
        <table class="table">
          <thead>
            <tr>
              <th>Wallet</th>
              <th class="hide-sm">Chains</th>
              <th class="hide-sm">Status</th>
              <th class="num">Value</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.wallet.id) {
              <tr (click)="open(r.wallet.id)">
                <td>
                  <a [routerLink]="['/wallets', r.wallet.id]" class="name">{{ r.wallet.label }}</a>
                  <div class="addr muted small">{{ r.wallet.address | short: 8 : 6 }}</div>
                </td>
                <td class="hide-sm"><app-chain-dots [chainIds]="r.wallet.chains" [max]="8" /></td>
                <td class="hide-sm">
                  @if (r.failing.length) {
                    <span class="badge bad" [attr.title]="r.failingText">{{ r.failing.length === 1 ? r.failing[0] + ' failing' : r.failing.length + ' chains failing' }}</span>
                  } @else if (r.lastOk) {
                    <span class="muted small">Read {{ r.lastOk | ago: clock.now() }}</span>
                  } @else {
                    <span class="badge">Waiting for first read</span>
                  }
                </td>
                <td class="num sensitive">{{ r.usd | usd }}</td>
              </tr>
            } @empty {
              <tr><td colspan="4" class="muted">No wallets yet. Add one to start watching.</td></tr>
            }
          </tbody>
        </table>
      </section>
    </div>
  `,
  styles: `
    tbody tr { cursor: pointer; }
    tbody tr:hover td { background: color-mix(in oklab, var(--well) 50%, transparent); }
    .name { font-weight: 600; text-decoration: none; }
    @media (max-width: 640px) { .hide-sm { display: none; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Wallets {
  protected readonly store = inject(Store);
  protected readonly clock = inject(Clock);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly addParam = toSignal(this.route.queryParamMap.pipe(map((p) => p.has('add'))), { initialValue: false });
  private readonly addToggle = signal<boolean | null>(null);
  protected readonly adding = computed(() => this.addToggle() ?? (this.addParam() || (this.store.loaded() && !this.store.wallets().length)));

  protected readonly rows = computed(() => {
    const syncs = this.store.syncs();
    const totals = this.store.walletTotals();
    const chains = this.store.chainMap();
    return this.store.wallets().map((wallet) => {
      const mine = syncs.filter((s) => s.walletId === wallet.id && wallet.chains.includes(s.chainId));
      const failing = mine.filter((s) => !s.ok);
      return {
        wallet,
        usd: totals.get(wallet.id) ?? 0,
        failing: failing.map((s) => chains.get(s.chainId)?.name ?? s.chainId),
        failingText: failing.map((s) => `${chains.get(s.chainId)?.name}: ${s.error}`).join('\n'),
        lastOk: Math.max(0, ...mine.map((s) => s.lastOkAt ?? 0)) || undefined,
      };
    });
  });

  protected setAdding(v: boolean): void {
    this.addToggle.set(v);
    if (!v && this.addParam()) void this.router.navigate([], { queryParams: {} });
  }

  protected open(id: string): void {
    void this.router.navigate(['/wallets', id]);
  }
}
