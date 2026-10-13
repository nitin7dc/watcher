import { sha256 } from '@noble/hashes/sha2';
import { bech32, bech32m, createBase58check } from '@scure/base';
import { getAddress, isAddress } from 'viem';
import type { ChainFamily } from './chains';

export type ParsedTarget =
  | { kind: 'address'; family: ChainFamily; address: string }
  | { kind: 'ens'; name: string }
  | { kind: 'invalid'; reason: string };

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Decoded byte length of a base58 string, or -1 if it contains invalid characters. */
export function base58ByteLength(input: string): number {
  const bytes: number[] = [];
  for (const ch of input) {
    let carry = B58.indexOf(ch);
    if (carry < 0) return -1;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let leadingZeros = 0;
  while (input[leadingZeros] === '1') leadingZeros++;
  return bytes.length + leadingZeros;
}

export function parseTarget(raw: string): ParsedTarget {
  const input = raw.trim();
  if (!input) return { kind: 'invalid', reason: 'Empty' };

  if (/^0x/i.test(input)) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(input)) {
      return { kind: 'invalid', reason: 'EVM addresses are 0x followed by 40 hex characters' };
    }
    if (!isAddress(input)) return { kind: 'invalid', reason: 'Checksum does not match' };
    return { kind: 'address', family: 'evm', address: getAddress(input.toLowerCase()) };
  }

  const lower = input.toLowerCase();
  const looksSegwit = lower.startsWith('bc1');
  if (looksSegwit && (input === lower || input === input.toUpperCase()) && isValidSegwit(lower)) {
    return { kind: 'address', family: 'btc', address: lower };
  }

  const len = base58ByteLength(input);
  if (len === 25 && /^[13]/.test(input)) {
    return isValidLegacy(input)
      ? { kind: 'address', family: 'btc', address: input }
      : { kind: 'invalid', reason: 'Bitcoin address checksum does not match' };
  }
  if (len === 32) return { kind: 'address', family: 'sol', address: input };
  if (looksSegwit) return { kind: 'invalid', reason: 'Bitcoin address checksum does not match' };

  if (/^[^\s.]+(\.[^\s.]+)+$/.test(input) && !input.includes('/')) {
    return { kind: 'ens', name: lower };
  }

  return { kind: 'invalid', reason: 'Not a recognised EVM, Bitcoin or Solana address' };
}

const base58check = createBase58check(sha256);

/** Mainnet P2PKH (`1…`) or P2SH (`3…`) with a valid base58check checksum. */
function isValidLegacy(address: string): boolean {
  try {
    const payload = base58check.decode(address);
    return payload.length === 21 && (payload[0] === 0x00 || payload[0] === 0x05);
  } catch {
    return false;
  }
}

/** Mainnet segwit: v0 uses bech32 with a 20 or 32 byte program, v1+ uses bech32m (BIP-350). */
function isValidSegwit(address: string): boolean {
  for (const coder of [bech32, bech32m]) {
    try {
      const { prefix, words } = coder.decode(address as `${string}1${string}`, 90);
      if (prefix !== 'bc' || !words.length) continue;
      const version = words[0];
      const program = coder.fromWords(words.slice(1));
      if (version === 0) {
        if (coder === bech32 && (program.length === 20 || program.length === 32)) return true;
      } else if (version <= 16 && coder === bech32m && program.length >= 2 && program.length <= 40) {
        return true;
      }
    } catch {
      /* wrong checksum variant or malformed */
    }
  }
  return false;
}

export interface BulkLine {
  line: number;
  input: string;
  label: string;
  target: ParsedTarget;
}

/**
 * One wallet per line: `address`, `address label`, or `address, label`.
 * Blank lines and lines starting with `#` are skipped.
 */
export function parseBulk(text: string): BulkLine[] {
  return text
    .split(/\r?\n/)
    .map((l, i) => ({ l: l.trim(), i }))
    .filter(({ l }) => l && !l.startsWith('#'))
    .map(({ l, i }) => {
      const [first, ...rest] = l.split(/[\s,;]+/);
      return {
        line: i + 1,
        input: first,
        label: rest.join(' ').trim(),
        target: parseTarget(first),
      };
    });
}

export function sameAddress(a: string, b: string, family: ChainFamily): boolean {
  return family === 'sol' ? a === b : a.toLowerCase() === b.toLowerCase();
}
