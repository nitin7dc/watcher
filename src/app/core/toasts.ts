import { Injectable, signal } from '@angular/core';

export type ToastTone = 'info' | 'gain' | 'loss' | 'error';

export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

@Injectable({ providedIn: 'root' })
export class Toasts {
  private seq = 0;
  readonly items = signal<Toast[]>([]);

  show(text: string, tone: ToastTone = 'info', ms = 5_000): void {
    const id = ++this.seq;
    this.items.update((list) => [...list.slice(-3), { id, text, tone }]);
    setTimeout(() => this.dismiss(id), ms);
  }

  dismiss(id: number): void {
    this.items.update((list) => list.filter((t) => t.id !== id));
  }
}
