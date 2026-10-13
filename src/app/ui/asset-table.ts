import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NATIVE } from '../core/models';
import type { AssetGroup } from '../core/holdings';
import { Store } from '../core/store';
import { ChainDot, ChainDots, TokenMark } from './marks';
import { AmountPipe, PctPipe, PricePipe, ShortPipe, UsdPipe } from './pipes';

@Component({
  selector: 'app-asset-table',
  imports: [RouterLink, TokenMark, ChainDots, ChainDot, UsdPipe, PricePipe, AmountPipe, PctPipe, ShortPipe],
  template: `
    <table class="table">
      <thead>
        <tr>
          <th>Asset</th>
          <th class="num hide-sm">Price, 24h</th>
          <th class="num">Balance</th>
          <th class="num">Value</th>
        </tr>
      </thead>
      <tbody>
        @for (a of rows(); track a.id) {
          <tr class="main" [class.open]="open() === a.id" (click)="toggle(a.id)">
            <td>
              <button type="button" class="asset" [attr.aria-expanded]="open() === a.id" (click)="$event.stopPropagation(); toggle(a.id)">
                <app-token-mark [symbol]="a.symbol" [chainId]="a.chains.length === 1 ? a.chains[0] : undefined" />
                <span class="names">
                  <strong>{{ a.symbol || (a.holdings[0].asset | short: 4 : 4) }}</strong>
                  <span class="sub">
                    @if (a.chains.length > 1) {
                      <app-chain-dots [chainIds]="a.chains" />
                      {{ a.chains.length }} chains
                    } @else {
                      {{ a.name || chainName(a.chains[0]) }}
                    }
                  </span>
                </span>
              </button>
            </td>
            <td class="num hide-sm">
              <div>{{ a.price | price }}</div>
              <div class="sub" [class.gain]="(a.change24h ?? 0) > 0" [class.loss]="(a.change24h ?? 0) < 0">{{ a.change24h | pct }}</div>
            </td>
            <td class="num sensitive">{{ a.amount | amount }}</td>
            <td class="num">
              <div class="sensitive">{{ a.usd | usd }}</div>
              @if (total() && a.usd) {
                <div class="share" [attr.aria-label]="((a.usd / total()) * 100).toFixed(1) + '% of total'">
                  <span [style.width.%]="(a.usd / total()) * 100"></span>
                </div>
              }
            </td>
          </tr>
          @if (open() === a.id) {
            @for (h of a.holdings; track h.key) {
              <tr class="detail">
                <td>
                  <span class="where">
                    <app-chain-dot [chainId]="h.chainId" />
                    <a [routerLink]="['/wallets', h.walletId]">{{ walletLabel(h.walletId) }}</a>
                    <span class="muted">on {{ chainName(h.chainId) }}</span>
                    @if (h.asset !== native) {
                      <span class="muted addr">{{ h.asset | short: 6 : 4 }}</span>
                    }
                  </span>
                </td>
                <td class="num hide-sm muted">{{ h.price | price }}</td>
                <td class="num sensitive">{{ h.amount | amount }}</td>
                <td class="num sensitive">{{ h.usd | usd }}</td>
              </tr>
            }
          }
        } @empty {
          <tr>
            <td colspan="4" class="muted">{{ emptyText() }}</td>
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: `
    :host { display: block; overflow-x: auto; }
    tr.main { cursor: pointer; }
    tr.main:hover td { background: color-mix(in oklab, var(--well) 50%, transparent); }
    .asset {
      display: flex; align-items: center; gap: 12px; padding: 0; border: 0; background: none;
      font: inherit; color: inherit; text-align: left; cursor: pointer;
    }
    .names { display: grid; line-height: 1.25; }
    .names strong { font-weight: 620; }
    .sub { font-size: 0.8rem; color: var(--graphite); display: inline-flex; align-items: center; gap: 6px; justify-content: inherit; }
    .num .sub { display: block; }
    .share { height: 3px; background: var(--well); border-radius: 2px; margin-top: 5px; margin-left: auto; width: 72px; }
    .share span { display: block; height: 100%; background: var(--accent); border-radius: 2px; min-width: 2px; }
    tr.detail td { padding-top: 7px; padding-bottom: 7px; font-size: 0.88rem; background: color-mix(in oklab, var(--well) 40%, transparent); }
    .where { display: inline-flex; align-items: center; gap: 8px; padding-left: 44px; flex-wrap: wrap; }
    @media (max-width: 640px) { .hide-sm { display: none; } .where { padding-left: 0; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetTable {
  private readonly store = inject(Store);
  readonly assets = input.required<AssetGroup[]>();
  readonly total = input(0);
  readonly limit = input<number>();
  readonly emptyText = input('No balances yet.');

  protected readonly native = NATIVE;
  protected readonly open = signal<string | null>(null);
  protected readonly rows = computed(() => {
    const l = this.limit();
    return l ? this.assets().slice(0, l) : this.assets();
  });

  protected toggle(id: string): void {
    this.open.update((o) => (o === id ? null : id));
  }

  protected chainName(id: string): string {
    return this.store.chainMap().get(id)?.name ?? id;
  }

  protected walletLabel(id: string): string {
    return this.store.walletMap().get(id)?.label ?? 'Wallet';
  }
}
