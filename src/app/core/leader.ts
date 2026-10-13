import { signal } from '@angular/core';

export const LOCK_NAME = 'watcher-sync-leader';
export const LEASE_KEY = 'watcher-sync-leader';
export const LEGACY_LEASE_KEY = 'spyglass-sync-leader';
const LEASE_TTL_MS = 12_000;
const LEASE_RENEW_MS = 4_000;

export interface Lease {
  id: string;
  until: number;
}

/** Whether `me` may lead given the stored lease, and the lease to write if so. */
export function decideLease(current: Lease | null, me: string, now: number, ttlMs = LEASE_TTL_MS): { leader: boolean; write?: Lease } {
  if (!current || current.until <= now || current.id === me) return { leader: true, write: { id: me, until: now + ttlMs } };
  return { leader: false };
}

function readLease(): Lease | null {
  try {
    const v = JSON.parse(localStorage.getItem(LEASE_KEY) ?? 'null') as Lease | null;
    return v && typeof v.id === 'string' && typeof v.until === 'number' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Elects one tab to poll chains. Uses the Web Locks API, which releases the lock
 * when the holding tab closes; falls back to a short localStorage lease.
 */
export class LeaderElection {
  readonly isLeader = signal(false);
  private readonly id = crypto.randomUUID();
  private release?: () => void;
  private timer?: ReturnType<typeof setInterval>;
  private stopped = false;

  start(): void {
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
      void navigator.locks.request(LOCK_NAME, () => {
        if (this.stopped) return;
        this.isLeader.set(true);
        return new Promise<void>((resolve) => (this.release = resolve));
      });
      return;
    }
    this.startLease();
    window.addEventListener('pagehide', () => this.dropLease());
    window.addEventListener('pageshow', (e) => {
      if (e.persisted && !this.stopped) this.startLease();
    });
  }

  private startLease(): void {
    const tick = () => {
      const { leader, write } = decideLease(readLease(), this.id, Date.now());
      if (write) localStorage.setItem(LEASE_KEY, JSON.stringify(write));
      this.isLeader.set(leader && readLease()?.id === this.id);
    };
    clearInterval(this.timer);
    tick();
    this.timer = setInterval(tick, LEASE_RENEW_MS);
  }

  private dropLease(): void {
    clearInterval(this.timer);
    if (readLease()?.id === this.id) localStorage.removeItem(LEASE_KEY);
    this.isLeader.set(false);
  }

  stop(): void {
    this.stopped = true;
    this.release?.();
    this.dropLease();
  }
}
