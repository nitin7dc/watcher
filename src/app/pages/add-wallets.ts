import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { parseBulk, sameAddress } from '../core/address';
import { DEFAULT_EVM_SELECTION } from '../core/chains';
import { Store } from '../core/store';
import { Toasts } from '../core/toasts';
import { WalletActions, type NewWallet } from '../core/wallet-actions';
import { ChainDot } from '../ui/marks';
import { ShortPipe } from '../ui/pipes';

const PLACEHOLDER = `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 Main
vitalik.eth
bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh Cold storage
9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM, Solana`;

@Component({
  selector: 'app-add-wallets',
  imports: [ChainDot, ShortPipe],
  template: `
    <form class="panel" (submit)="$event.preventDefault(); submit()">
      <div class="panel-head">
        <h2>Add wallets</h2>
        <button type="button" class="btn quiet sm" (click)="closed.emit()">Close</button>
      </div>

      <label class="field">
        <span>Addresses</span>
        <textarea
          #box
          rows="5"
          [placeholder]="placeholder"
          [value]="text()"
          (input)="text.set(box.value)"
          spellcheck="false"
          autocomplete="off"
          autofocus
        ></textarea>
        <span class="hint">One per line, with an optional label after it. EVM addresses, ENS names, Bitcoin and Solana addresses are detected automatically. Only public addresses: never paste a seed phrase or private key.</span>
      </label>

      @if (lines().length) {
        <ul class="preview">
          @for (l of lines(); track l.line) {
            <li [class.bad]="l.problem">
              <span class="kind">{{ l.kindLabel }}</span>
              <span class="addr">{{ l.input | short: 10 : 6 }}</span>
              @if (l.label) {
                <span class="muted">{{ l.label }}</span>
              }
              @if (l.problem) {
                <span class="problem">{{ l.problem }}</span>
              }
            </li>
          }
        </ul>
      }

      @if (hasEvm()) {
        <fieldset>
          <legend>EVM chains to track</legend>
          <label class="check small">
            <input type="checkbox" [checked]="detect()" (change)="detect.set($any($event.target).checked)" />
            Pick chains for each address from its on-chain activity
          </label>
          <div class="chip-set" role="group" aria-label="EVM chains">
            @for (c of evmChains(); track c.id) {
              <button type="button" class="chip" [attr.aria-pressed]="selected().has(c.id)" (click)="toggle(c.id)">
                <app-chain-dot [chainId]="c.id" /> {{ c.name }}
              </button>
            }
          </div>
          <span class="hint muted small">
            {{ detect() ? 'Chains with no activity are skipped. If none are found, the selection above is used.' : 'Applied to every EVM address in the list. You can change it per wallet later.' }}
          </span>
        </fieldset>
      }

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }

      <div class="row">
        <button type="submit" class="btn primary" [disabled]="!valid().length || busy()">
          {{ busy() ? progress() : valid().length > 1 ? 'Add ' + valid().length + ' wallets' : 'Add wallet' }}
        </button>
        @if (invalidCount()) {
          <span class="muted small">{{ invalidCount() }} {{ invalidCount() === 1 ? 'line' : 'lines' }} will be skipped</span>
        }
      </div>
    </form>
  `,
  styles: `
    fieldset { border: 0; padding: 0; margin: 0; display: grid; gap: 10px; }
    legend { font-size: 0.87rem; font-weight: 560; padding: 0; margin-bottom: 8px; }
    .preview { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: 0.88rem; }
    .preview li { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
    .kind { font-weight: 600; min-width: 6.5em; }
    .bad .kind, .problem { color: var(--loss); }
    .error { color: var(--loss); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddWallets {
  private readonly store = inject(Store);
  private readonly actions = inject(WalletActions);
  private readonly toasts = inject(Toasts);
  readonly closed = output<void>();

  protected readonly placeholder = PLACEHOLDER;
  protected readonly text = signal('');
  protected readonly detect = signal(false);
  protected readonly selected = signal(new Set(DEFAULT_EVM_SELECTION));
  protected readonly busy = signal(false);
  protected readonly progress = signal('');
  protected readonly error = signal('');

  protected readonly evmChains = computed(() => this.store.chains().filter((c) => c.family === 'evm'));

  protected readonly lines = computed(() => {
    const existing = this.store.wallets();
    const seen = new Set<string>();
    return parseBulk(this.text()).map((l) => {
      const t = l.target;
      let problem = '';
      let kindLabel = 'Invalid';
      if (t.kind === 'invalid') problem = t.reason;
      else if (t.kind === 'ens') kindLabel = 'ENS name';
      else kindLabel = t.family === 'evm' ? 'EVM' : t.family === 'btc' ? 'Bitcoin' : 'Solana';
      if (t.kind === 'address') {
        const k = `${t.family}:${t.family === 'sol' ? t.address : t.address.toLowerCase()}`;
        if (existing.some((w) => w.family === t.family && sameAddress(w.address, t.address, t.family))) problem = 'Already tracked';
        else if (seen.has(k)) problem = 'Listed twice';
        seen.add(k);
      }
      return { ...l, kindLabel, problem };
    });
  });

  protected readonly valid = computed(() => this.lines().filter((l) => !l.problem));
  protected readonly invalidCount = computed(() => this.lines().length - this.valid().length);
  protected readonly hasEvm = computed(() =>
    this.valid().some((l) => l.target.kind === 'ens' || (l.target.kind === 'address' && l.target.family === 'evm')),
  );

  protected toggle(id: string): void {
    this.selected.update((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  protected async submit(): Promise<void> {
    const evmDefault = this.evmChains().map((c) => c.id).filter((id) => this.selected().has(id));
    if (this.hasEvm() && !evmDefault.length) {
      this.error.set('Choose at least one EVM chain.');
      return;
    }
    this.error.set('');
    this.busy.set(true);
    const entries: NewWallet[] = [];
    const failures: string[] = [];
    try {
      const todo = this.valid();
      for (const [i, l] of todo.entries()) {
        this.progress.set(`Checking ${i + 1} of ${todo.length}…`);
        const t = l.target;
        let address: string;
        let family = t.kind === 'address' ? t.family : 'evm';
        let ens: string | undefined;
        if (t.kind === 'ens') {
          const resolved = await this.actions.resolveEns(t.name).catch(() => null);
          if (!resolved) {
            failures.push(`${t.name} did not resolve`);
            continue;
          }
          address = resolved;
          ens = t.name;
          family = 'evm';
        } else if (t.kind === 'address') {
          address = t.address;
        } else continue;

        let chains = family === 'btc' ? ['btc'] : family === 'sol' ? ['sol'] : evmDefault;
        if (family === 'evm' && this.detect()) {
          const found = await this.actions.detectChains(address);
          if (found.length) chains = found;
        }
        entries.push({ address, family, label: l.label, chains, ens });
      }
      const { added, skipped } = await this.actions.add(entries);
      const parts = [`Added ${added.length} ${added.length === 1 ? 'wallet' : 'wallets'}.`];
      if (skipped) parts.push(`${skipped} already tracked.`);
      if (failures.length) parts.push(failures.join(', ') + '.');
      this.toasts.show(parts.join(' '), failures.length ? 'error' : 'info');
      if (added.length) {
        this.text.set('');
        this.closed.emit();
      }
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
