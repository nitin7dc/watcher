import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Store } from '../core/store';
import { SyncService } from '../core/sync.service';
import { Clock } from './clock';

const TICKS = Array.from({ length: 60 }, (_, i) => i);

@Component({
  selector: 'app-sweep-dial',
  template: `
    <button
      type="button"
      class="dial"
      [class.running]="sync.running()"
      [style.width.px]="size()"
      [style.height.px]="size()"
      (click)="sync.run()"
      [attr.aria-label]="label()"
      [attr.title]="label()"
    >
      <svg viewBox="-100 -100 200 200" aria-hidden="true">
        @for (i of ticks; track i) {
          <line
            [attr.y1]="i % 5 === 0 ? -80 : -86"
            y2="-94"
            [attr.transform]="'rotate(' + i * 6 + ')'"
            [class.major]="i % 5 === 0"
            [class.passed]="i < passed()"
          />
        }
        <g class="hand" [class.snap]="angle() === 0" [style.transform]="'rotate(' + angle() + 'deg)'">
          <line y1="-40" y2="-90" />
        </g>
      </svg>
      <span class="readout">
        <span class="value">{{ readout() }}</span>
        <span class="caption">{{ caption() }}</span>
      </span>
    </button>
  `,
  styles: `
    :host { display: inline-flex; flex: none; }
    .dial {
      position: relative; padding: 0; border: 0; border-radius: 50%;
      background: transparent; color: inherit; font: inherit; cursor: pointer;
    }
    .dial:hover line.passed { stroke: var(--hand); }
    svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    line { stroke: var(--rule); stroke-width: 1.6; transition: stroke 200ms; }
    line.major { stroke-width: 2.6; stroke: color-mix(in oklab, var(--graphite) 60%, var(--rule)); }
    line.passed { stroke: color-mix(in oklab, var(--accent) 55%, transparent); }
    .hand { transition: transform 160ms cubic-bezier(.4, 2.2, .6, 1); }
    .hand.snap { transition: none; }
    .hand line { stroke: var(--hand); stroke-width: 3; filter: drop-shadow(0 0 4px var(--hand)); }
    .running .hand { animation: spin 1.1s linear infinite; transition: none; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .readout {
      position: absolute; inset: 0; display: grid; place-content: center; text-align: center;
      line-height: 1.1; pointer-events: none;
    }
    .value { font-size: 1.45rem; font-weight: 300; letter-spacing: -0.03em; color: var(--accent); }
    .caption { font-size: 0.68rem; color: var(--graphite); margin-top: 3px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SweepDial {
  protected readonly sync = inject(SyncService);
  private readonly store = inject(Store);
  private readonly clock = inject(Clock);
  readonly size = input(148);
  protected readonly ticks = TICKS;

  /** Whole seconds until the next read, or null when nothing is scheduled. */
  private readonly secondsLeft = computed(() => {
    const next = this.sync.nextRunAt();
    if (!next) return null;
    const left = Math.ceil((next - this.clock.now()) / 1000);
    return Math.min(this.store.settings().refreshSec, Math.max(0, left));
  });

  /** Seconds-hand position, 0–59: one tick per second, back at 12 when the read starts. */
  private readonly tick = computed(() => {
    const left = this.secondsLeft();
    return left == null ? 0 : (60 - (left % 60)) % 60;
  });

  protected readonly passed = computed(() => (this.sync.running() ? 60 : this.tick()));
  protected readonly angle = computed(() => this.tick() * 6);

  protected readonly readout = computed(() => {
    if (this.sync.running()) return '···';
    if (!this.sync.online()) return '—';
    const left = this.secondsLeft();
    if (left == null) return '—';
    if (left < 60) return `${left}s`;
    return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  });

  protected readonly caption = computed(() => {
    if (this.sync.running()) return 'reading chains';
    if (!this.sync.online()) return 'offline';
    if (this.store.settings().paused) return 'paused';
    return this.sync.nextRunAt() ? 'to next read' : 'idle';
  });

  protected readonly label = computed(() =>
    this.sync.running() ? 'Refreshing balances' : `Refresh now. ${this.readout()} ${this.caption()}.`,
  );
}
