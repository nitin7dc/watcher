import { DestroyRef, inject, signal, type Signal } from '@angular/core';
import { liveQuery } from 'dexie';

/**
 * Mirrors a Dexie query into a signal; re-emits whenever the underlying tables change.
 * `loaded` fires once, on the first successful emission only.
 */
export function liveSignal<T>(query: () => Promise<T> | T, initial: T, loaded?: () => void): Signal<T> {
  const s = signal(initial);
  let first = true;
  const sub = liveQuery(query).subscribe({
    next: (v) => {
      s.set(v);
      if (first) {
        first = false;
        loaded?.();
      }
    },
    error: (e) => console.error('liveQuery failed', e),
  });
  inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  return s.asReadonly();
}
