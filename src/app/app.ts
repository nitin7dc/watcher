import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, viewChild } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DataActions } from './core/data-actions';
import { formatUsd } from './core/format';
import { Store } from './core/store';
import { SyncService } from './core/sync.service';
import { Toasts } from './core/toasts';
import { Clock } from './ui/clock';
import { HoldButton } from './ui/hold-button';
import { AgoPipe } from './ui/pipes';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, HoldButton, AgoPipe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly store = inject(Store);
  protected readonly sync = inject(SyncService);
  protected readonly toasts = inject(Toasts);
  protected readonly clock = inject(Clock);
  private readonly data = inject(DataActions);
  private readonly killDialog = viewChild.required<ElementRef<HTMLDialogElement>>('kill');

  protected readonly nav = [
    { path: '/', label: 'overview', exact: true },
    { path: '/assets', label: 'assets', exact: false },
    { path: '/wallets', label: 'wallets', exact: false },
    { path: '/tokens', label: 'tokens', exact: false },
    { path: '/networks', label: 'networks', exact: false },
    { path: '/settings', label: 'settings', exact: false },
  ];

  protected readonly customTokens = computed(() => this.store.tokens().filter((t) => t.source === 'custom').length);

  constructor() {
    this.sync.init();
    effect(() => {
      document.documentElement.classList.toggle('privacy', this.store.settings().privacy);
    });
    effect(() => {
      const hasWallets = this.store.wallets().length > 0;
      document.title =
        hasWallets && !this.store.settings().privacy ? `${formatUsd(this.store.total())} | Watcher` : 'Watcher';
    });
  }

  protected togglePrivacy(): void {
    void this.store.updateSettings({ privacy: !this.store.settings().privacy });
  }

  protected togglePause(): void {
    const paused = !this.store.settings().paused;
    void this.store.updateSettings({ paused });
    if (!paused) void this.sync.run();
  }

  protected openKill(): void {
    this.killDialog().nativeElement.showModal();
  }

  protected closeKill(): void {
    this.killDialog().nativeElement.close();
  }

  protected exportFirst(): void {
    void this.data.exportBackup();
  }

  protected destroy(): void {
    void this.data.destroyEverything();
  }
}
