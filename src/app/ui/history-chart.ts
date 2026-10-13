import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { comparableSeries } from '../core/history';
import type { Snapshot } from '../core/models';
import { PctPipe, UsdPipe } from './pipes';

type Range = '24h' | '7d' | '30d' | 'all';
const RANGES: { id: Range; label: string; ms: number }[] = [
  { id: '24h', label: '24h', ms: 86_400_000 },
  { id: '7d', label: '7 days', ms: 7 * 86_400_000 },
  { id: '30d', label: '30 days', ms: 30 * 86_400_000 },
  { id: 'all', label: 'All', ms: Infinity },
];
const W = 1000;
const H = 200;

@Component({
  selector: 'app-history-chart',
  imports: [UsdPipe, PctPipe],
  template: `
    <div class="head">
      <div class="sensitive">
        @if (delta(); as d) {
          <span [class.gain]="d.abs > 0" [class.loss]="d.abs < 0">
            {{ d.abs > 0 ? '+' : '' }}{{ d.abs | usd }} ({{ d.pct | pct }})
          </span>
          <span class="muted"> over {{ rangeLabel() }}</span>
        } @else {
          <span class="muted">Value over time</span>
        }
      </div>
      <div class="segmented" role="group" aria-label="Chart range">
        @for (r of ranges; track r.id) {
          <button type="button" [attr.aria-pressed]="range() === r.id" (click)="range.set(r.id)">{{ r.label }}</button>
        }
      </div>
    </div>

    @if (points().length > 1) {
      <div class="plot sensitive" (pointermove)="hover($event)" (pointerleave)="hoverIdx.set(-1)">
        <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" role="img" [attr.aria-label]="'Portfolio value, ' + rangeLabel()">
          <path class="area" [attr.d]="paths().area" />
          <path class="line" [attr.d]="paths().line" />
        </svg>
        <span class="y top">{{ domain().max | usd: true }}</span>
        <span class="y bottom">{{ domain().min | usd: true }}</span>
        @if (hovered(); as h) {
          <span class="cursor" [style.left.%]="h.x"></span>
          <span class="marker" [style.left.%]="h.x" [style.top.%]="h.y"></span>
          <span class="tip" [style.left.%]="h.x" [class.flip]="h.x > 70">
            <strong>{{ h.p.totalUsd | usd }}</strong>
            <span class="muted">{{ h.label }}</span>
          </span>
        }
      </div>
      @if (leftOut()) {
        <p class="muted small">
          {{ leftOut() }} {{ leftOut() === 1 ? 'wallet is' : 'wallets are' }} left out of this line because {{ leftOut() === 1 ? 'it wasn’t' : 'they weren’t' }} read for the whole range.
        </p>
      }
    } @else {
      <p class="muted small blank">The line starts drawing after a couple of refreshes. Snapshots are kept in this browser only.</p>
    }
  `,
  styles: `
    :host { display: grid; gap: 14px; }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .plot { position: relative; height: 200px; touch-action: none; }
    svg { width: 100%; height: 100%; display: block; overflow: visible; }
    .plot {
      background-image: linear-gradient(to bottom, var(--rule) 1px, transparent 1px);
      background-size: 100% 25%;
    }
    .line { fill: none; stroke: var(--accent); stroke-width: 1.5; vector-effect: non-scaling-stroke; stroke-linejoin: round; filter: drop-shadow(0 0 3px color-mix(in oklab, var(--accent) 50%, transparent)); }
    .area { fill: color-mix(in oklab, var(--accent) 6%, transparent); }
    .y { position: absolute; left: 0; font-size: 0.75rem; color: var(--graphite); background: var(--face); padding: 0 4px 0 0; }
    .y.top { top: 0; }
    .y.bottom { bottom: 0; }
    .cursor { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--rule); }
    .marker { position: absolute; width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 3px var(--face), 0 0 10px var(--accent); }
    .tip {
      position: absolute; top: -6px; transform: translate(10px, -100%);
      display: grid; padding: 6px 10px; border-radius: var(--r-control); background: var(--well); color: var(--ink);
      border: 1px solid var(--rule);
      font-size: 0.82rem; white-space: nowrap; pointer-events: none;
    }
    .tip .muted { color: var(--graphite); }
    .tip.flip { transform: translate(calc(-100% - 10px), -100%); }
    .blank { min-height: 120px; display: grid; align-content: center; max-width: 46ch; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryChart {
  readonly snapshots = input.required<Snapshot[]>();
  readonly walletIds = input.required<string[]>();
  protected readonly ranges = RANGES;
  protected readonly W = W;
  protected readonly H = H;
  protected readonly range = signal<Range>('24h');
  protected readonly hoverIdx = signal(-1);

  protected readonly rangeLabel = computed(() => {
    const r = this.range();
    return r === 'all' ? 'all time' : r === '24h' ? 'the past 24 hours' : `the past ${RANGES.find((x) => x.id === r)!.label}`;
  });

  private readonly series = computed(() => {
    const all = this.snapshots();
    const ms = RANGES.find((r) => r.id === this.range())!.ms;
    const inRange = !all.length || ms === Infinity ? all : all.filter((p) => p.ts >= all[all.length - 1].ts - ms);
    return comparableSeries(inRange, this.walletIds());
  });

  protected readonly points = computed(() => this.series().points);
  protected readonly leftOut = computed(() =>
    this.points().length > 1 ? this.walletIds().length - this.series().walletIds.length : 0,
  );

  protected readonly domain = computed(() => {
    const pts = this.points();
    let min = Math.min(...pts.map((p) => p.totalUsd));
    let max = Math.max(...pts.map((p) => p.totalUsd));
    if (max - min < Math.max(1, max * 0.002)) {
      const pad = Math.max(1, max * 0.01);
      min -= pad;
      max += pad;
    }
    return { min: Math.max(0, min), max, t0: pts[0]?.ts ?? 0, t1: pts[pts.length - 1]?.ts ?? 1 };
  });

  private xy(p: { ts: number; totalUsd: number }): [number, number] {
    const d = this.domain();
    const x = d.t1 === d.t0 ? 0 : ((p.ts - d.t0) / (d.t1 - d.t0)) * W;
    const y = H - ((p.totalUsd - d.min) / (d.max - d.min || 1)) * (H - 16) - 8;
    return [x, y];
  }

  protected readonly paths = computed(() => {
    const coords = this.points().map((p) => this.xy(p));
    const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
    const area = coords.length ? `${line}L${coords[coords.length - 1][0]},${H}L${coords[0][0]},${H}Z` : '';
    return { line, area };
  });

  protected readonly delta = computed(() => {
    const pts = this.points();
    if (pts.length < 2) return null;
    const a = pts[0].totalUsd;
    const b = pts[pts.length - 1].totalUsd;
    return { abs: b - a, pct: a ? ((b - a) / a) * 100 : 0 };
  });

  protected readonly hovered = computed(() => {
    const i = this.hoverIdx();
    const p = this.points()[i];
    if (!p) return null;
    const [x, y] = this.xy(p);
    return {
      p,
      x: (x / W) * 100,
      y: (y / H) * 100,
      label: new Date(p.ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    };
  });

  protected hover(e: PointerEvent): void {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const d = this.domain();
    const t = d.t0 + frac * (d.t1 - d.t0);
    const pts = this.points();
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].ts - t) < Math.abs(pts[best].ts - t)) best = i;
    this.hoverIdx.set(best);
  }
}
