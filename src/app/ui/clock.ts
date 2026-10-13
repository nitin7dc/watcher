import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class Clock {
  readonly now = signal(Date.now());

  constructor() {
    setInterval(() => this.now.set(Date.now()), 1_000);
  }
}
