import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Activity } from '../core/models';
import { Store } from '../core/store';
import { Clock } from './clock';
import { ChainDot } from './marks';
import { AgoPipe, AmountPipe, UsdPipe } from './pipes';

@Component({
  selector: 'app-activity-list',
  imports: [RouterLink, ChainDot, AmountPipe, UsdPipe, AgoPipe],
  template: `
    <ol>
      @for (a of items().slice(0, limit()); track a.id) {
        <li>
          <span class="delta sensitive" [class.gain]="a.delta > 0" [class.loss]="a.delta < 0">
            {{ a.delta > 0 ? '+' : '−' }}{{ abs(a.delta) | amount }} {{ a.symbol }}
          </span>
          <span class="usd sensitive muted">{{ a.usd != null ? (abs(a.usd) | usd) : '' }}</span>
          <span class="where muted small">
            <app-chain-dot [chainId]="a.chainId" />
            @if (showWallet()) {
              <a [routerLink]="['/wallets', a.walletId]">{{ store.walletMap().get(a.walletId)?.label ?? 'Removed wallet' }}</a>
            }
            {{ store.chainMap().get(a.chainId)?.name }}
          </span>
          <time class="muted small" [attr.datetime]="iso(a.ts)" [attr.title]="local(a.ts)">{{ a.ts | ago: clock.now() }}</time>
        </li>
      } @empty {
        <li class="none muted small">Balance changes show up here as they happen. The first read of each wallet sets the baseline.</li>
      }
    </ol>
  `,
  styles: `
    ol { list-style: none; margin: 0; padding: 0; display: grid; }
    li {
      display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; padding: 10px 0;
      border-bottom: 1px solid color-mix(in oklab, var(--rule) 60%, transparent);
    }
    li:last-child { border-bottom: 0; }
    .delta { font-weight: 600; }
    .usd, time { text-align: right; }
    .where { display: inline-flex; align-items: center; gap: 7px; }
    .none { display: block; border: 0; max-width: 44ch; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityList {
  protected readonly store = inject(Store);
  protected readonly clock = inject(Clock);
  readonly items = input.required<Activity[]>();
  readonly limit = input(8);
  readonly showWallet = input(true);

  protected abs = Math.abs;
  protected iso = (ts: number) => new Date(ts).toISOString();
  protected local = (ts: number) => new Date(ts).toLocaleString();
}
