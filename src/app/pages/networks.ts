import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { ChainDef } from '../core/chains';
import { NetworkActions, type NewChain } from '../core/network-actions';
import { rpcUrlsFor } from '../core/providers/evm';
import { Store } from '../core/store';
import { Toasts } from '../core/toasts';
import { ChainDot } from '../ui/marks';

type ProbeState = { busy: true } | { ms: number; height: bigint } | { error: string };

@Component({
  selector: 'app-networks',
  imports: [ChainDot],
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Networks</h1>
          <p>Balances are read from public endpoints by default. Point any chain at your own RPC for better privacy and fewer rate limits. Endpoints are tried in order.</p>
        </div>
      </header>

      <section class="panel">
        <table class="table">
          <thead>
            <tr>
              <th>Network</th>
              <th class="hide-sm">Endpoint in use</th>
              <th class="hide-sm">Wallets</th>
              <th class="num">Check</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.chain.id) {
              <tr>
                <td>
                  <span class="row name"><app-chain-dot [chainId]="r.chain.id" /> {{ r.chain.name }}</span>
                  @if (r.failing) {
                    <span class="badge bad">{{ r.failing }} failing</span>
                  }
                </td>
                <td class="hide-sm">
                  <span class="addr small">{{ host(r.urls[0]) }}</span>
                  @if (r.override) {
                    <span class="badge">Your RPC</span>
                  } @else if (r.urls.length > 1) {
                    <span class="muted small"> +{{ r.urls.length - 1 }} fallback</span>
                  }
                </td>
                <td class="hide-sm muted">{{ r.walletCount || '' }}</td>
                <td class="num">
                  @if (probes()[r.chain.id]; as p) {
                    <span class="probe small" [class.loss]="'error' in p">
                      @if ('busy' in p) { Testing… }
                      @else if ('error' in p) { {{ p.error }} }
                      @else { {{ p.ms }} ms, height {{ p.height.toLocaleString() }} }
                    </span>
                  }
                  <button type="button" class="btn sm quiet" (click)="test(r.chain, r.urls[0])">Test</button>
                  <button type="button" class="btn sm quiet" (click)="editing.set(editing() === r.chain.id ? null : r.chain.id)" [attr.aria-expanded]="editing() === r.chain.id">RPC</button>
                </td>
              </tr>
              @if (editing() === r.chain.id) {
                <tr class="edit">
                  <td colspan="4">
                    <form class="edit-form" (submit)="$event.preventDefault(); saveOverride(r.chain, url.value)">
                      <label class="field">
                        <span>Custom endpoint for {{ r.chain.name }}</span>
                        <input #url type="url" [value]="r.override ?? ''" placeholder="https://…" spellcheck="false" />
                        <span class="hint">Checked before saving{{ r.chain.family === 'evm' ? '; it must serve chain ' + r.chain.evmChainId : '' }}. Built-in endpoints stay as fallbacks.</span>
                      </label>
                      <div class="row">
                        <button type="submit" class="btn sm primary" [disabled]="saving()">{{ saving() ? 'Checking…' : 'Save endpoint' }}</button>
                        @if (r.override) {
                          <button type="button" class="btn sm" (click)="saveOverride(r.chain, '')">Use built-in endpoints</button>
                        }
                        @if (r.chain.custom) {
                          <button type="button" class="btn sm danger" (click)="removeChain(r.chain)">Remove network</button>
                        }
                      </div>
                    </form>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </section>

      <form class="panel" (submit)="$event.preventDefault(); addChain()">
        <div>
          <h2>Add an EVM network</h2>
          <p class="muted small">Any EVM chain with a browser-accessible RPC. The chain ID is read from the endpoint.</p>
        </div>
        <div class="grid">
          <label class="field"><span>Name</span><input type="text" [value]="form().name" (input)="patch('name', $event)" placeholder="Mantle" /></label>
          <label class="field"><span>RPC URL</span><input type="url" [value]="form().rpcUrl" (input)="patch('rpcUrl', $event)" placeholder="https://rpc.mantle.xyz" required /></label>
          <label class="field"><span>Native symbol</span><input type="text" [value]="form().nativeSymbol" (input)="patch('nativeSymbol', $event)" placeholder="MNT" /></label>
          <label class="field"><span>Explorer URL</span><input type="url" [value]="form().explorer" (input)="patch('explorer', $event)" placeholder="https://explorer.mantle.xyz" /></label>
          <label class="field">
            <span>CoinGecko ID of native coin</span>
            <input type="text" [value]="form().coingeckoId" (input)="patch('coingeckoId', $event)" placeholder="mantle" />
            <span class="hint">Optional, for pricing the native balance.</span>
          </label>
          <label class="field">
            <span>DefiLlama chain name</span>
            <input type="text" [value]="form().llamaSlug" (input)="patch('llamaSlug', $event)" placeholder="mantle" />
            <span class="hint">Optional, for pricing tokens on this chain.</span>
          </label>
        </div>
        @if (formError()) {
          <p class="loss" role="alert">{{ formError() }}</p>
        }
        <div><button type="submit" class="btn primary" [disabled]="!form().rpcUrl || saving()">{{ saving() ? 'Checking endpoint…' : 'Add network' }}</button></div>
      </form>
    </div>
  `,
  styles: `
    .name { gap: 8px; font-weight: 580; }
    .probe { margin-right: 6px; color: var(--graphite); }
    .probe.loss { color: var(--loss); }
    tr.edit td { background: color-mix(in oklab, var(--well) 40%, transparent); padding: 14px; }
    .edit-form { display: grid; gap: 12px; max-width: 640px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
    @media (max-width: 640px) { .hide-sm { display: none; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Networks {
  private readonly store = inject(Store);
  private readonly actions = inject(NetworkActions);
  private readonly toasts = inject(Toasts);

  protected readonly editing = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly probes = signal<Record<string, ProbeState>>({});
  protected readonly form = signal<NewChain>({ name: '', rpcUrl: '', nativeSymbol: '', explorer: '', coingeckoId: '', llamaSlug: '' });
  protected readonly formError = signal('');

  protected readonly rows = computed(() => {
    const wallets = this.store.wallets();
    const syncs = this.store.syncs();
    return this.store.chains().map((chain) => {
      const override = this.store.overrideMap().get(chain.id);
      return {
        chain,
        override,
        urls: rpcUrlsFor(chain, override),
        walletCount: wallets.filter((w) => w.chains.includes(chain.id)).length,
        failing: syncs.filter((s) => s.chainId === chain.id && !s.ok).length,
      };
    });
  });

  protected host(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }

  protected patch(key: keyof NewChain, e: Event): void {
    const value = (e.target as HTMLInputElement).value;
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected async test(chain: ChainDef, url: string): Promise<void> {
    this.probes.update((p) => ({ ...p, [chain.id]: { busy: true } }));
    try {
      const r = await this.actions.probe(chain, url);
      this.probes.update((p) => ({ ...p, [chain.id]: r }));
    } catch (e) {
      this.probes.update((p) => ({ ...p, [chain.id]: { error: shortMsg(e) } }));
    }
  }

  protected async saveOverride(chain: ChainDef, url: string): Promise<void> {
    this.saving.set(true);
    try {
      await this.actions.setOverride(chain.id, url.trim() || null);
      this.toasts.show(url.trim() ? `${chain.name} now reads from ${this.host(url)}.` : `${chain.name} is back on built-in endpoints.`);
      this.editing.set(null);
    } catch (e) {
      this.toasts.show(`Endpoint not saved: ${shortMsg(e)}`, 'error');
    } finally {
      this.saving.set(false);
    }
  }

  protected async addChain(): Promise<void> {
    this.formError.set('');
    this.saving.set(true);
    try {
      const c = await this.actions.addCustom(this.form());
      this.toasts.show(`${c.name} (chain ${c.evmChainId}) added. Turn it on for a wallet from its page.`);
      this.form.set({ name: '', rpcUrl: '', nativeSymbol: '', explorer: '', coingeckoId: '', llamaSlug: '' });
    } catch (e) {
      this.formError.set(shortMsg(e));
    } finally {
      this.saving.set(false);
    }
  }

  protected async removeChain(chain: ChainDef): Promise<void> {
    await this.actions.removeCustom(chain.id);
    this.editing.set(null);
    this.toasts.show(`Removed ${chain.name}.`);
  }
}

function shortMsg(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string };
  const m = err?.shortMessage || err?.message || String(e);
  if (/fetch|HTTP request failed/i.test(m)) return 'Endpoint unreachable from the browser (offline, blocked, or no CORS)';
  return m.split('\n')[0].slice(0, 120);
}
