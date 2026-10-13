import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { explorerTokenUrl } from '../core/chains';
import type { Token } from '../core/models';
import { Store } from '../core/store';
import { Toasts } from '../core/toasts';
import { TokenActions, type TokenPreview } from '../core/token-actions';
import { TokenMark } from '../ui/marks';
import { PricePipe, ShortPipe } from '../ui/pipes';

const SOURCE_LABEL: Record<Token['source'], string> = {
  default: 'Built in',
  custom: 'Added by you',
  discovered: 'Found in a wallet',
};
const PAGE = 150;

@Component({
  selector: 'app-tokens',
  imports: [TokenMark, PricePipe, ShortPipe],
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Tokens</h1>
          <p>Every wallet is checked for each token listed on its chain. On Solana, a private RPC lets Watcher find every token a wallet holds; the free public endpoint only allows checking listed ones.</p>
        </div>
      </header>

      <form class="panel" (submit)="$event.preventDefault(); lookup()">
        <h2>Add a token by address</h2>
        <div class="add-grid">
          <label class="field">
            <span>Chain</span>
            <select [value]="chainId()" (change)="chainId.set($any($event.target).value); preview.set(null)">
              @for (c of tokenChains(); track c.id) {
                <option [value]="c.id">{{ c.name }}</option>
              }
            </select>
          </label>
          <label class="field">
            <span>{{ isSol() ? 'Mint address' : 'Contract address' }}</span>
            <input type="text" [value]="address()" (input)="address.set($any($event.target).value); preview.set(null)" [placeholder]="isSol() ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : '0x…'" spellcheck="false" autocomplete="off" />
          </label>
          <button type="submit" class="btn" [disabled]="!address().trim() || looking()">{{ looking() ? 'Reading contract…' : 'Look up' }}</button>
        </div>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        @if (preview(); as p) {
          <div class="preview">
            <app-token-mark [symbol]="symbol() || p.symbol" [chainId]="p.chainId" />
            <label class="field sym">
              <span>Symbol</span>
              <input type="text" [value]="symbol()" (input)="symbol.set($any($event.target).value)" maxlength="16" />
            </label>
            <dl>
              <div><dt>Name</dt><dd>{{ p.name || 'Not provided' }}</dd></div>
              <div><dt>Decimals</dt><dd>{{ p.decimals }}</dd></div>
              <div><dt>Price</dt><dd>{{ p.price != null ? (p.price | price) : 'No price found' }}</dd></div>
            </dl>
            <div class="row">
              <button type="button" class="btn primary" (click)="add(p)">
                {{ p.existing ? 'Update ' : 'Add ' }}{{ symbol() || p.symbol || 'token' }}
              </button>
              @if (p.existing) {
                <span class="muted small">Already listed ({{ sourceLabel[p.existing.source] }}){{ p.existing.hidden ? ', currently hidden' : '' }}.</span>
              }
            </div>
          </div>
        }
      </form>

      <section class="panel">
        <div class="filters">
          <select aria-label="Filter by chain" [value]="filterChain()" (change)="filterChain.set($any($event.target).value)">
            <option value="">All chains</option>
            @for (c of tokenChains(); track c.id) {
              <option [value]="c.id">{{ c.name }}</option>
            }
          </select>
          <input type="search" aria-label="Search tokens" placeholder="Search symbol, name or address" [value]="query()" (input)="query.set($any($event.target).value)" />
          <span class="muted small">{{ list().length }} tokens</span>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>Token</th>
              <th class="hide-sm">Contract</th>
              <th class="hide-sm">Source</th>
              <th class="num">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (t of list().slice(0, page); track t.key) {
              <tr [class.dim]="t.hidden">
                <td>
                  <span class="asset">
                    <app-token-mark [symbol]="t.symbol || '?'" [chainId]="t.chainId" />
                    <span>
                      <strong>{{ t.symbol || 'Unknown' }}</strong>
                      <span class="sub">{{ t.name || chainName(t.chainId) }}</span>
                    </span>
                  </span>
                </td>
                <td class="hide-sm">
                  <a class="addr small" [href]="tokenUrl(t)" target="_blank" rel="noopener noreferrer">{{ t.address | short: 8 : 6 }}</a>
                </td>
                <td class="hide-sm"><span class="badge">{{ sourceLabel[t.source] }}</span></td>
                <td class="num">
                  <button type="button" class="btn sm quiet" (click)="toggleHidden(t)">{{ t.hidden ? 'Show' : 'Hide' }}</button>
                  @if (t.source === 'custom') {
                    <button type="button" class="btn sm quiet danger" (click)="remove(t)">Remove</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="4" class="muted">No tokens match.</td></tr>
            }
          </tbody>
        </table>
        @if (list().length > page) {
          <p class="muted small">Showing the first {{ page }}. Search to narrow the list.</p>
        }
      </section>
    </div>
  `,
  styles: `
    .add-grid { display: grid; grid-template-columns: minmax(160px, 220px) minmax(0, 1fr) auto; gap: 12px; align-items: end; }
    @media (max-width: 720px) { .add-grid { grid-template-columns: 1fr; } }
    .error { color: var(--loss); }
    .preview { display: flex; flex-wrap: wrap; align-items: center; gap: 16px 24px; padding-top: 16px; border-top: 1px solid var(--rule); }
    .sym { width: 9rem; }
    dl { display: flex; gap: 20px; margin: 0; flex-wrap: wrap; }
    dt { font-size: 0.8rem; color: var(--graphite); }
    dd { margin: 0; font-weight: 560; }
    .filters { display: flex; gap: 10px 14px; flex-wrap: wrap; align-items: center; }
    .filters select { width: auto; }
    .filters input { flex: 1 1 220px; width: auto; }
    .asset { display: flex; gap: 12px; align-items: center; }
    .asset > span { display: grid; line-height: 1.25; }
    .sub { font-size: 0.8rem; color: var(--graphite); }
    tr.dim td:not(:last-child) { opacity: 0.5; }
    @media (max-width: 640px) { .hide-sm { display: none; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Tokens {
  protected readonly store = inject(Store);
  private readonly actions = inject(TokenActions);
  private readonly toasts = inject(Toasts);

  protected readonly sourceLabel = SOURCE_LABEL;
  protected readonly page = PAGE;
  protected readonly chainId = signal('eth');
  protected readonly address = signal('');
  protected readonly symbol = signal('');
  protected readonly looking = signal(false);
  protected readonly error = signal('');
  protected readonly preview = signal<TokenPreview | null>(null);
  protected readonly filterChain = signal('');
  protected readonly query = signal('');

  protected readonly tokenChains = computed(() => this.store.chains().filter((c) => c.family !== 'btc'));
  protected readonly isSol = computed(() => this.store.chainMap().get(this.chainId())?.family === 'sol');

  protected readonly list = computed(() => {
    const c = this.filterChain();
    const q = this.query().trim().toLowerCase();
    const order = { custom: 0, default: 1, discovered: 2 };
    return this.store
      .tokens()
      .filter((t) => (!c || t.chainId === c) && (!q || t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.address.toLowerCase().includes(q)))
      .sort((a, b) => order[a.source] - order[b.source] || a.chainId.localeCompare(b.chainId) || a.symbol.localeCompare(b.symbol));
  });

  protected chainName(id: string): string {
    return this.store.chainMap().get(id)?.name ?? id;
  }

  protected tokenUrl(t: Token): string {
    const c = this.store.chainMap().get(t.chainId);
    return c ? explorerTokenUrl(c, t.address) : '#';
  }

  protected async lookup(): Promise<void> {
    this.error.set('');
    this.preview.set(null);
    this.looking.set(true);
    try {
      const p = await this.actions.lookup(this.chainId(), this.address());
      this.symbol.set(p.existing?.symbol || p.symbol);
      this.preview.set(p);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.looking.set(false);
    }
  }

  protected async add(p: TokenPreview): Promise<void> {
    await this.actions.add(p, this.symbol());
    this.toasts.show(`${this.symbol() || p.symbol} is now checked for every wallet on ${this.chainName(p.chainId)}.`);
    this.preview.set(null);
    this.address.set('');
  }

  protected toggleHidden(t: Token): void {
    void this.actions.setHidden(t.key, !t.hidden);
  }

  protected async remove(t: Token): Promise<void> {
    await this.actions.remove(t);
    this.toasts.show(`Removed ${t.symbol || 'token'}.`);
  }
}
