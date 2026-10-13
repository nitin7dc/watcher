import { Pipe, type PipeTransform } from '@angular/core';
import { formatAmount, formatPct, formatPrice, formatUsd, shortAddress, timeAgo } from '../core/format';

@Pipe({ name: 'usd' })
export class UsdPipe implements PipeTransform {
  transform(v: number | undefined | null, compact = false): string {
    return formatUsd(v, compact);
  }
}

@Pipe({ name: 'price' })
export class PricePipe implements PipeTransform {
  transform(v: number | undefined | null): string {
    return formatPrice(v);
  }
}

@Pipe({ name: 'amount' })
export class AmountPipe implements PipeTransform {
  transform(v: number, sig = 6): string {
    return formatAmount(v, sig);
  }
}

@Pipe({ name: 'pct' })
export class PctPipe implements PipeTransform {
  transform(v: number | undefined | null): string {
    return formatPct(v);
  }
}

@Pipe({ name: 'short' })
export class ShortPipe implements PipeTransform {
  transform(v: string, head = 6, tail = 4): string {
    return shortAddress(v, head, tail);
  }
}

@Pipe({ name: 'ago' })
export class AgoPipe implements PipeTransform {
  transform(ts: number | undefined, now: number): string {
    return timeAgo(ts, now);
  }
}

export const PIPES = [UsdPipe, PricePipe, AmountPipe, PctPipe, ShortPipe, AgoPipe] as const;
