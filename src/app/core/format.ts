const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});
const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 2,
});

export function formatUsd(value: number | undefined | null, compact = false): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (compact && Math.abs(value) >= 100_000) return usdCompact.format(value);
  if (value !== 0 && Math.abs(value) < 0.01) return value < 0 ? '−<$0.01' : '<$0.01';
  return usd.format(value).replace('-', '−');
}

const priceSmall = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumSignificantDigits: 3,
});

export function formatPrice(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value >= 0.995) return formatUsd(value);
  return priceSmall.format(value);
}

export function formatAmount(value: number, maxSig = 6): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs === 0) return '0';
  if (abs >= 1e9) return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
  if (abs >= 1) {
    const intDigits = Math.floor(Math.log10(abs)) + 1;
    return value.toLocaleString('en-US', { maximumFractionDigits: Math.max(0, maxSig - intDigits) });
  }
  if (abs < 1e-6) return value < 0 ? '−<0.000001' : '<0.000001';
  return value.toLocaleString('en-US', { maximumSignificantDigits: Math.min(maxSig, 4) });
}

export function formatPct(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

export function shortAddress(address: string, head = 6, tail = 4): string {
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

export function timeAgo(ts: number | undefined, now = Date.now()): string {
  if (!ts) return 'never';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function toAmount(raw: bigint | string, decimals: number): number {
  const v = typeof raw === 'string' ? BigInt(raw) : raw;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = v % base;
  return Number(whole) + Number(frac) / Number(base);
}
