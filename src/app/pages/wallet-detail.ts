import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { explorerAddressUrl } from '../core/chains';
import { compareValue, isVisible, totalUsd } from '../core/holdings';
import { NATIVE } from '../core/models';
import { Store } from '../core/store';
import { SyncService } from '../core/sync.service';
import { Toasts } from '../core/toasts';
import { WalletActions } from '../core/wallet-actions';
import { ActivityList } from '../ui/activity-list';
import { Clock } from '../ui/clock';
import { ChainDot, TokenMark } from '../ui/marks';
import { AgoPipe, AmountPipe, PricePipe, ShortPipe, UsdPipe } from '../ui/pipes';

@Component({
  selector: 'app-wallet-detail',
  imports: [RouterLink, ActivityList, ChainDot, TokenMark, UsdPipe, AmountPipe, PricePipe, ShortPipe, AgoPipe],
  template: `
    <div class="page">
      <a routerLink="/wallets" class="back muted small">All wallets</a>
      @if (wallet(); as w) {
        <header class="page-head">
          <div class="who">
            @if (renaming()) {
              <form class="row" (submit)="$event.preventDefault(); saveName(name.value)">
                <input #name type="text" [value]="w.label" aria-label="Wallet label" autofocus />
                <button class="btn sm primary" type="submit">Save</button>
                <button class="btn sm quiet" type="button" (click)="renaming.set(false)">Cancel</button>
              </form>
            } @else {
              <h1>{{ w.label }}</h1>
            }
            <p class="row addr-row">
              @if (w.ens && w.ens !== w.label) {
                <span class="badge">{{ w.ens }}</span>
              }
              <code class="addr">{{ w.address }}</code>
              <button type="button" class="btn sm" (click)="copy(w.address)">Copy</button>
              @if (!renaming()) {
                <button type="button" class="btn sm" (click)="renaming.set(true)">Rename</button>
              }
            </p>
          </div>
          <div class="sum">
            <p class="figure sensitive">{{ total() | usd }}</p>
            <button type="button" class="btn sm" (click)="refresh(w.id)" [disabled]="sync.running()">
              {{ sync.running() ? 'Reading…' : 'Refresh this wallet' }}
            </button>
          </div>
        </header>

        @if (w.family === 'evm') {
          <section class="panel">
            <div class="panel-head">
              <h2>Chains watched</h2>
              <span class="meta">Changes apply immediately</span>
            </div>
            <div class="chip-set" role="group" aria-label="Chains watched">
              @for (c of evmChains(); track c.id) {
                <button type="button" class="chip" [attr.aria-pressed]="w.chains.includes(c.id)" (click)="toggleChain(c.id)">
                  <app-chain-dot [chainId]="c.id" /> {{ c.name }}
                </button>
              }
            </div>
          </section>
        }

        <div class="cols">
          <div class="stack">
            @for (s of sections(); track s.chain.id) {
              <section class="panel">
                <div class="panel-head">
                  <h2 class="row"><app-chain-dot [chainId]="s.chain.id" /> {{ s.chain.name }}</h2>
                  <span class="meta sensitive">{{ s.usd | usd }}</span>
                </div>
                <p class="row small">
                  @if (s.sync && !s.sync.ok) {
                    <span class="badge bad">{{ s.sync.error }}</span>
                    <span class="muted">{{ s.sync.lastOkAt ? 'Showing balances from ' + (s.sync.lastOkAt | ago: clock.now()) : 'No successful read yet' }}</span>
                  } @else if (s.sync) {
                    <span class="muted">Read {{ s.sync.updatedAt | ago: clock.now() }}</span>
                  } @else {
                    <span class="muted">Waiting for first read</span>
                  }
                  @if (sync.blocks().get(s.chain.id); as b) {
                    <span class="muted">at block {{ b.toLocaleString() }}</span>
                  }
                  <a [href]="explorer(s.chain.id, w.address)" target="_blank" rel="noopener noreferrer" class="muted">View on explorer</a>
                </p>
                @if (sync.limitedScan().has(s.chain.id)) {
                  <p class="muted small">
                    The public {{ s.chain.name }} endpoint only allows checking tokens on the
                    <a routerLink="/tokens">token list</a>. To find every token this wallet holds, add your own RPC
                    (a free Helius or QuickNode key works) in <a routerLink="/networks">Networks</a>.
                  </p>
                }
                @if (s.rows.length) {
                  <table class="table">
                    <tbody>
                      @for (h of s.rows; track h.key) {
                        <tr [class.dim]="!h.visible">
                          <td>
                            <span class="asset">
                              <app-token-mark [symbol]="h.symbol" />
                              <span>
                                <strong>{{ h.symbol || (h.asset | short: 4 : 4) }}</strong>
                                <span class="sub">{{ h.asset === native ? 'Native' : (h.asset | short: 6 : 4) }}</span>
                              </span>
                            </span>
                          </td>
                          <td class="num muted hide-sm">{{ h.price | price }}</td>
                          <td class="num sensitive">{{ h.amount | amount }}</td>
                          <td class="num sensitive">{{ h.usd | usd }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                } @else {
                  <p class="muted small">No balances on {{ s.chain.name }}.</p>
                }
              </section>
            }
            <label class="check small">
              <input type="checkbox" [checked]="showAll()" (change)="showAll.set($any($event.target).checked)" />
              Show small, unpriced and hidden balances
            </label>
          </div>
          <div class="stack">
            <section class="panel">
              <h2>Changes in this wallet</h2>
              <app-activity-list [items]="activity()" [limit]="12" [showWallet]="false" />
            </section>
            <section class="panel">
              <h2>Stop watching</h2>
              <p class="muted small">Removes this address, its balances and its activity from this browser. Your funds are not affected.</p>
              @if (confirmRemove()) {
                <div class="row">
                  <button type="button" class="btn danger" (click)="remove(w.id)">Remove {{ w.label }}</button>
                  <button type="button" class="btn quiet" (click)="confirmRemove.set(false)">Cancel</button>
                </div>
              } @else {
                <button type="button" class="btn danger" (click)="confirmRemove.set(true)">Remove wallet</button>
              }
            </section>
          </div>
        </div>
      } @else if (store.loaded()) {
        <p class="empty">This wallet isn't tracked. <a routerLink="/wallets">Back to wallets</a></p>
      }
    </div>
  `,
  styles: `
    .back { text-decoration: none; justify-self: start; }
    .back::before { content: '‹ '; }
    .who { display: grid; gap: 8px; min-width: 0; }
    .addr-row code { font-size: 0.92rem; }
    .sum { display: grid; gap: 8px; justify-items: end; }
    .figure { font-size: 1.9rem; font-weight: 260; letter-spacing: -0.05em; line-height: 1; }
    .asset { display: flex; gap: 12px; align-items: center; }
    .asset > span { display: grid; line-height: 1.25; }
    .sub { font-size: 0.8rem; color: var(--graphite); }
    tr.dim { opacity: 0.55; }
    @media (max-width: 640px) { .hide-sm { display: none; } .sum { justify-items: start; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletDetail {
  protected readonly store = inject(Store);
  protected readonly sync = inject(SyncService);
  protected readonly clock = inject(Clock);
  private readonly actions = inject(WalletActions);
  private readonly toasts = inject(Toasts);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  protected readonly native = NATIVE;
  protected readonly renaming = signal(false);
  protected readonly confirmRemove = signal(false);
  protected readonly showAll = signal(false);

  protected readonly wallet = computed(() => this.store.walletMap().get(this.id()));
  protected readonly evmChains = computed(() => this.store.chains().filter((c) => c.family === 'evm'));

  private readonly holdings = computed(() => {
    const s = this.store.settings();
    return this.store
      .allHoldings()
      .filter((h) => h.walletId === this.id())
      .map((h) => ({ ...h, visible: isVisible(h, s) }));
  });

  protected readonly total = computed(() => totalUsd(this.holdings().filter((h) => h.visible)));

  protected readonly sections = computed(() => {
    const w = this.wallet();
    if (!w) return [];
    const all = this.showAll();
    return w.chains
      .map((id) => this.store.chainMap().get(id))
      .filter((c) => c !== undefined)
      .map((chain) => {
        const mine = this.holdings().filter((h) => h.chainId === chain.id);
        const rows = mine.filter((h) => all || h.visible).sort(compareValue);
        return {
          chain,
          rows,
          usd: totalUsd(mine.filter((h) => h.visible)),
          sync: this.store.syncMap().get(`${w.id}|${chain.id}`),
        };
      })
      .sort((a, b) => b.usd - a.usd);
  });

  protected readonly activity = computed(() => this.store.activity().filter((a) => a.walletId === this.id()));

  protected explorer(chainId: string, address: string): string {
    const c = this.store.chainMap().get(chainId);
    return c ? explorerAddressUrl(c, address) : '#';
  }

  protected async copy(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
    this.toasts.show('Address copied.');
  }

  protected async saveName(label: string): Promise<void> {
    if (label.trim()) await this.actions.update(this.id(), { label: label.trim() });
    this.renaming.set(false);
  }

  protected toggleChain(id: string): void {
    const w = this.wallet();
    if (!w) return;
    const chains = w.chains.includes(id) ? w.chains.filter((c) => c !== id) : [...w.chains, id];
    if (!chains.length) {
      this.toasts.show('Keep at least one chain, or remove the wallet instead.', 'error');
      return;
    }
    void this.actions.update(w.id, { chains });
  }

  protected refresh(id: string): void {
    void this.sync.run([id]);
  }

  protected async remove(id: string): Promise<void> {
    const label = this.wallet()?.label;
    await this.actions.remove(id);
    this.toasts.show(`Stopped watching ${label}.`);
    void this.router.navigate(['/wallets']);
  }
}
