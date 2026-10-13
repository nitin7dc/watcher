import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Store } from '../core/store';
import { UsdPipe } from './pipes';

@Component({
  selector: 'app-allocation',
  imports: [UsdPipe],
  template: `
    @if (rows().length) {
      <div class="bar" role="img" [attr.aria-label]="summary()">
        @for (r of rows(); track r.chainId) {
          <span [style.flex-grow]="r.share" [style.background]="r.color" [attr.title]="r.name + ' ' + (r.share * 100).toFixed(1) + '%'"></span>
        }
      </div>
      <ul>
        @for (r of rows(); track r.chainId) {
          <li>
            <span class="sw" [style.background]="r.color"></span>
            <span class="name">{{ r.name }}</span>
            <span class="pct">{{ (r.share * 100).toFixed(1) }}%</span>
            <span class="usd sensitive">{{ r.usd | usd: true }}</span>
          </li>
        }
      </ul>
    } @else {
      <p class="muted small">Chains appear here once priced balances arrive.</p>
    }
  `,
  styles: `
    :host { display: grid; gap: 14px; }
    .bar { display: flex; gap: 3px; height: 14px; }
    .bar span { border-radius: 4px; min-width: 4px; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 7px; }
    li { display: grid; grid-template-columns: 10px 1fr auto 6.5em; align-items: center; gap: 10px; font-size: 0.92rem; }
    .sw { width: 10px; height: 10px; border-radius: 3px; }
    .pct { color: var(--graphite); }
    .usd { text-align: right; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Allocation {
  private readonly store = inject(Store);
  readonly items = input.required<{ chainId: string; usd: number }[]>();

  protected readonly rows = computed(() => {
    const total = this.items().reduce((s, i) => s + i.usd, 0);
    if (!total) return [];
    return this.items().map((i) => {
      const c = this.store.chainMap().get(i.chainId);
      return { ...i, share: i.usd / total, name: c?.name ?? i.chainId, color: c?.color ?? 'var(--graphite)' };
    });
  });

  protected readonly summary = computed(() =>
    this.rows().map((r) => `${r.name} ${(r.share * 100).toFixed(0)}%`).join(', '),
  );
}
