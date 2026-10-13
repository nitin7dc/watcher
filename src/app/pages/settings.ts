import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DataActions } from '../core/data-actions';
import { rpcUrlsFor } from '../core/providers/evm';
import { Store } from '../core/store';
import { Toasts } from '../core/toasts';
import { HoldButton } from '../ui/hold-button';

const INTERVALS = [
  { sec: 60, label: '1 min' },
  { sec: 120, label: '2 min' },
  { sec: 300, label: '5 min' },
  { sec: 600, label: '10 min' },
];

@Component({
  selector: 'app-settings',
  imports: [HoldButton],
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Settings</h1>
          <p>Everything here is saved in this browser's IndexedDB. Nothing is synced or uploaded.</p>
        </div>
      </header>

      <div class="cols">
        <div class="stack">
          <section class="panel">
            <h2>Refreshing</h2>
            <div class="setting">
              <div>
                <p>Read balances every</p>
                <p class="muted small">Public endpoints rate-limit busy clients. Longer intervals are kinder when you watch many wallets.</p>
              </div>
              <div class="segmented" role="group" aria-label="Refresh interval">
                @for (i of intervals; track i.sec) {
                  <button type="button" [attr.aria-pressed]="s().refreshSec === i.sec" (click)="store.updateSettings({ refreshSec: i.sec })">{{ i.label }}</button>
                }
              </div>
            </div>
            <label class="setting check">
              <span>
                <span class="d">Pause automatic refresh</span>
                <span class="muted small">You can still refresh by hand from the dial.</span>
              </span>
              <input type="checkbox" [checked]="s().paused" (change)="store.updateSettings({ paused: $any($event.target).checked })" />
            </label>
          </section>

          <section class="panel">
            <h2>What counts toward totals</h2>
            <label class="setting check">
              <span>
                <span class="d">Hide balances worth less than</span>
                <span class="row small">
                  $<input type="number" min="0" step="0.5" class="dust" [value]="s().dustUsd" (change)="setDust($event)" aria-label="Dust threshold in US dollars" />
                </span>
              </span>
              <input type="checkbox" aria-label="Hide balances worth less than the amount set" [checked]="s().hideDust" (change)="store.updateSettings({ hideDust: $any($event.target).checked })" />
            </label>
            <label class="setting check">
              <span>
                <span class="d">Hide unpriced tokens found in wallets</span>
                <span class="muted small">Airdropped spam usually has no market price. Tokens you add yourself are always shown.</span>
              </span>
              <input type="checkbox" [checked]="s().hideUnpriced" (change)="store.updateSettings({ hideUnpriced: $any($event.target).checked })" />
            </label>
            <label class="setting check">
              <span>
                <span class="d">Hide amounts</span>
                <span class="muted small">Blurs every balance until you hover over it. Handy when sharing your screen.</span>
              </span>
              <input type="checkbox" [checked]="s().privacy" (change)="store.updateSettings({ privacy: $any($event.target).checked })" />
            </label>
          </section>

          <section class="panel">
            <h2>Notifications</h2>
            <label class="setting check">
              <span>
                <span class="d">Notify me when a balance changes while this tab is in the background</span>
                <span class="muted small">
                  @if (permission() === 'denied') {
                    Notifications are blocked for this site in your browser settings.
                  } @else if (permission() === 'unsupported') {
                    This browser doesn't support notifications.
                  } @else {
                    Only changes worth more than your small-balance threshold. The tab must stay open.
                  }
                </span>
              </span>
              <input type="checkbox" [checked]="s().notify && permission() === 'granted'" [disabled]="permission() === 'denied' || permission() === 'unsupported'" (change)="setNotify($any($event.target).checked)" />
            </label>
          </section>
        </div>

        <div class="stack">
          <section class="panel">
            <h2>Backup</h2>
            <p class="muted small">A JSON file with your wallets, custom tokens, networks and settings. Balance history isn't included.</p>
            <div class="row">
              <button type="button" class="btn" (click)="data.exportBackup()" [disabled]="!store.wallets().length">Export backup</button>
              <label class="btn">
                Import backup
                <input type="file" accept="application/json,.json" class="sr-only" (change)="importFile($event)" />
              </label>
            </div>
          </section>

          <section class="panel">
            <h2>Where requests go</h2>
            <p class="muted small">Watcher only makes read requests. Your addresses are visible to these services, but no keys exist to leak.</p>
            <ul class="hosts">
              @for (h of hosts(); track h.host) {
                <li><span class="addr">{{ h.host }}</span> <span class="muted small">{{ h.why }}</span></li>
              }
            </ul>
          </section>

          <section class="panel">
            <h2>History</h2>
            <p class="muted small">{{ store.snapshots().length }} value snapshots and {{ store.activity().length }}{{ store.activity().length === 200 ? '+' : '' }} recorded changes.</p>
            <div><button type="button" class="btn" (click)="clearHistory()">Clear history</button></div>
          </section>

          <section class="panel danger-zone">
            <h2>Destroy all data</h2>
            <p class="small">Erases every wallet, token, setting and snapshot from this browser, then reloads. Export a backup first if you might want them back.</p>
            <app-hold-button label="Hold to destroy everything" holdingLabel="Keep holding to destroy" [ms]="2000" (confirmed)="data.destroyEverything()" />
          </section>
        </div>
      </div>
    </div>
  `,
  styles: `
    .setting { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
    .setting > span, .setting > div:first-child { display: grid; gap: 2px; }
    label.setting { cursor: pointer; }
    .dust { width: 6em; padding: 4px 8px; }
    .hosts { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
    .hosts li { display: flex; gap: 10px; flex-wrap: wrap; align-items: baseline; }
    .danger-zone { border: 1px solid color-mix(in oklab, var(--loss) 35%, transparent); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage {
  protected readonly store = inject(Store);
  protected readonly data = inject(DataActions);
  private readonly toasts = inject(Toasts);
  protected readonly intervals = INTERVALS;
  protected readonly s = this.store.settings;

  protected readonly permission = signal<NotificationPermission | 'unsupported'>(
    'Notification' in window ? Notification.permission : 'unsupported',
  );

  protected readonly hosts = computed(() => {
    const map = new Map<string, string>([['coins.llama.fi', 'Prices (DefiLlama)']]);
    const used = new Set(this.store.trackedChainIds());
    for (const c of this.store.chains()) {
      if (!used.has(c.id)) continue;
      for (const u of rpcUrlsFor(c, this.store.overrideMap().get(c.id))) {
        try {
          const host = new URL(u).host;
          map.set(host, map.has(host) && map.get(host) !== c.name ? `${map.get(host)}, ${c.name}` : c.name);
        } catch {
          /* ignore malformed */
        }
      }
    }
    return [...map.entries()].map(([host, why]) => ({ host, why }));
  });

  protected setDust(e: Event): void {
    const v = Number((e.target as HTMLInputElement).value);
    if (Number.isFinite(v) && v >= 0) void this.store.updateSettings({ dustUsd: v });
  }

  protected async setNotify(on: boolean): Promise<void> {
    if (on && Notification.permission !== 'granted') {
      const p = await Notification.requestPermission();
      this.permission.set(p);
      if (p !== 'granted') return;
    }
    await this.store.updateSettings({ notify: on });
  }

  protected async importFile(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const r = await this.data.importBackup(file);
      this.toasts.show(`Imported ${r.wallets} wallets and ${r.tokens} tokens.`);
    } catch (err) {
      this.toasts.show((err as Error).message, 'error');
    }
  }

  protected async clearHistory(): Promise<void> {
    await this.data.clearHistory();
    this.toasts.show('History cleared.');
  }
}
