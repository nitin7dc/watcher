import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Store } from '../core/store';

@Component({
  selector: 'app-chain-dot',
  template: `<span class="dot" [style.background]="chain()?.color" [attr.title]="chain()?.name"></span>`,
  styles: `
    :host { display: inline-flex; }
    .dot { width: 9px; height: 9px; border-radius: 50%; display: block; box-shadow: 0 0 0 2px var(--face); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChainDot {
  private readonly store = inject(Store);
  readonly chainId = input.required<string>();
  readonly chain = computed(() => this.store.chainMap().get(this.chainId()));
}

@Component({
  selector: 'app-chain-dots',
  imports: [ChainDot],
  template: `
    @for (id of chainIds().slice(0, max()); track id) {
      <app-chain-dot [chainId]="id" />
    }
    @if (chainIds().length > max()) {
      <span class="more">+{{ chainIds().length - max() }}</span>
    }
  `,
  styles: `
    :host { display: inline-flex; align-items: center; gap: 3px; }
    .more { font-size: 0.75rem; color: var(--graphite); margin-left: 2px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChainDots {
  readonly chainIds = input.required<string[]>();
  readonly max = input(5);
}

/** Monogram tile for an asset. Logos are deliberately not fetched to avoid leaking holdings to image CDNs. */
@Component({
  selector: 'app-token-mark',
  imports: [ChainDot],
  template: `
    <span class="tile" [style.--h]="hue()">{{ letters() }}</span>
    @if (chainId(); as c) {
      <app-chain-dot class="on" [chainId]="c" />
    }
  `,
  styles: `
    :host { position: relative; display: inline-flex; flex: none; }
    .tile {
      width: 34px; height: 30px; border-radius: 4px;
      display: grid; place-items: center;
      font-size: 0.62rem; font-weight: 650; letter-spacing: -0.04em;
      border: 1px solid oklch(0.42 0.06 var(--h));
      background: oklch(0.2 0.03 var(--h));
      color: oklch(0.86 0.1 var(--h));
    }
    .on { position: absolute; right: -2px; bottom: -2px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TokenMark {
  readonly symbol = input.required<string>();
  readonly chainId = input<string>();
  readonly letters = computed(() => (this.symbol().replace(/[^a-z0-9]/gi, '') || '?').slice(0, 4).toUpperCase());
  readonly hue = computed(() => {
    let h = 0;
    for (const ch of this.symbol().toUpperCase()) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
  });
}
