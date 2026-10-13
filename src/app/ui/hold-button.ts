import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

/** A button that only fires after being held down, so destructive actions can't happen by accident. */
@Component({
  selector: 'app-hold-button',
  template: `
    <button
      type="button"
      [class.holding]="holding()"
      [style.--hold]="ms() + 'ms'"
      [disabled]="disabled()"
      (pointerdown)="start($event)"
      (pointerup)="cancel()"
      (pointerleave)="cancel()"
      (pointercancel)="cancel()"
      (keydown)="key($event, true)"
      (keyup)="key($event, false)"
      (contextmenu)="$event.preventDefault()"
    >
      <span class="fill" aria-hidden="true"></span>
      <span class="text">{{ holding() ? holdingLabel() : label() }}</span>
    </button>
  `,
  styles: `
    button {
      position: relative; overflow: hidden; width: 100%;
      font: inherit; font-weight: 620; padding: 14px 18px; border-radius: var(--r-control);
      border: 1px solid var(--loss); background: transparent; color: var(--loss);
      cursor: pointer; user-select: none; -webkit-user-select: none; touch-action: none;
    }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .fill {
      position: absolute; inset: 0; background: var(--loss);
      transform: scaleX(0); transform-origin: left; transition: transform 180ms ease-out;
    }
    .holding .fill { transform: scaleX(1); transition: transform var(--hold) linear; }
    .text { position: relative; mix-blend-mode: normal; }
    .holding .text { color: var(--face); }
    @media (prefers-reduced-motion: reduce) {
      .holding .fill { transition: none; transform: scaleX(1); opacity: 0.85; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HoldButton {
  readonly label = input('Hold to confirm');
  readonly holdingLabel = input('Keep holding…');
  readonly ms = input(1800);
  readonly disabled = input(false);
  readonly confirmed = output<void>();

  protected readonly holding = signal(false);
  private timer?: ReturnType<typeof setTimeout>;

  protected start(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.begin();
  }

  protected key(e: KeyboardEvent, down: boolean): void {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (down && !e.repeat) this.begin();
    if (!down) this.cancel();
  }

  private begin(): void {
    if (this.disabled() || this.holding()) return;
    this.holding.set(true);
    this.timer = setTimeout(() => {
      this.holding.set(false);
      this.confirmed.emit();
    }, this.ms());
  }

  protected cancel(): void {
    clearTimeout(this.timer);
    this.holding.set(false);
  }
}
