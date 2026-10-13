import { base58ByteLength, parseTarget } from './address';
import { BUILTIN_CHAINS, type ChainFamily } from './chains';
import type { CustomChain, RpcOverride, Settings, Token, TokenSource, Wallet } from './models';
import { endpointUrlProblem } from './urls';

export const BACKUP_APP = 'watcher';
export const BACKUP_APPS = ['watcher', 'spyglass'] as const;

export interface Backup {
  app: (typeof BACKUP_APPS)[number];
  version: 1;
  exportedAt: string;
  wallets: Wallet[];
  tokens: Token[];
  customChains: CustomChain[];
  rpcOverrides: RpcOverride[];
  settings?: Settings;
}

export interface CleanBackup {
  wallets: Wallet[];
  tokens: Token[];
  customChains: CustomChain[];
  rpcOverrides: RpcOverride[];
  settings: Partial<Settings>;
}

export const MAX_TOKEN_DECIMALS = 36;
const SOURCES: TokenSource[] = ['default', 'custom', 'discovered'];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isBackupApp = (v: unknown): v is (typeof BACKUP_APPS)[number] =>
  v === 'watcher' || v === 'spyglass';
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.length <= max ? v : undefined);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * Validates an imported backup and rebuilds every row from known fields only.
 * Malformed rows are dropped; endpoint URLs must pass the same rule as Networks.
 * Throws only when the file isn't a Watcher backup at all.
 */
export function sanitizeBackup(data: unknown, knownWallets: Pick<Wallet, 'family' | 'address'>[]): CleanBackup {
  if (!isObj(data) || !isBackupApp(data['app']) || !Array.isArray(data['wallets'])) {
    throw new Error('That file is not a Watcher backup.');
  }

  const customChains: CustomChain[] = [];
  for (const c of list(data['customChains'])) {
    if (!isObj(c)) continue;
    const id = str(c['id'], 40);
    const m = id?.match(/^evm:([1-9]\d{0,15})$/);
    const chainId = m ? Number(m[1]) : NaN;
    const rpcUrls = list(c['rpcUrls']);
    if (!m || !Number.isSafeInteger(chainId) || c['evmChainId'] !== chainId) continue;
    if (!rpcUrls.length || rpcUrls.some((u) => endpointUrlProblem(u) !== null)) continue;
    const explorer = str(c['explorer'], 200) ?? '';
    if (explorer && !explorer.startsWith('https://')) continue;
    const priceKey = str(c['nativePriceKey'], 80);
    const slug = str(c['llamaSlug'], 40);
    const color = str(c['color'], 7);
    customChains.push({
      id: id!,
      family: 'evm',
      name: str(c['name'], 64) || `Chain ${chainId}`,
      nativeSymbol: str(c['nativeSymbol'], 16) || 'ETH',
      nativeDecimals: 18,
      nativePriceKey: priceKey && /^coingecko:[a-z0-9-]+$/.test(priceKey) ? priceKey : undefined,
      llamaSlug: slug && /^[a-z0-9-]+$/.test(slug) ? slug : undefined,
      evmChainId: chainId,
      rpcUrls: rpcUrls as string[],
      explorer: explorer.replace(/\/$/, ''),
      color: color && /^#[0-9a-f]{6}$/i.test(color) ? color : '#6f7d78',
      custom: true,
    });
  }

  const families = new Map<string, ChainFamily>([
    ...BUILTIN_CHAINS.map((c) => [c.id, c.family] as const),
    ...customChains.map((c) => [c.id, c.family] as const),
  ]);

  const rpcOverrides: RpcOverride[] = [];
  for (const o of list(data['rpcOverrides'])) {
    if (!isObj(o)) continue;
    const chainId = str(o['chainId'], 40);
    if (!chainId || !families.has(chainId) || endpointUrlProblem(o['url']) !== null) continue;
    rpcOverrides.push({ chainId, url: o['url'] as string });
  }

  const tokens: Token[] = [];
  for (const t of list(data['tokens'])) {
    if (!isObj(t)) continue;
    const chainId = str(t['chainId'], 40);
    const family = chainId ? families.get(chainId) : undefined;
    const rawAddress = str(t['address'], 64);
    const decimals = t['decimals'];
    const source = t['source'] as TokenSource;
    if (!chainId || !rawAddress || (family !== 'evm' && family !== 'sol')) continue;
    if (!Number.isInteger(decimals) || (decimals as number) < 0 || (decimals as number) > MAX_TOKEN_DECIMALS) continue;
    if (!SOURCES.includes(source)) continue;
    const address = family === 'evm' ? rawAddress.toLowerCase() : rawAddress;
    if (family === 'evm' ? !/^0x[0-9a-f]{40}$/.test(address) : base58ByteLength(address) !== 32) continue;
    tokens.push({
      key: `${chainId}:${address}`,
      chainId,
      address,
      symbol: str(t['symbol'], 32) ?? '',
      name: str(t['name'], 64) ?? '',
      decimals: decimals as number,
      source,
      hidden: t['hidden'] === true,
      addedAt: typeof t['addedAt'] === 'number' && Number.isFinite(t['addedAt']) ? t['addedAt'] : Date.now(),
    });
  }

  const seen = new Set(knownWallets.map((w) => walletKey(w.family, w.address)));
  const wallets: Wallet[] = [];
  for (const w of list(data['wallets'])) {
    if (!isObj(w)) continue;
    const id = str(w['id'], 64);
    const target = parseTarget(str(w['address'], 128) ?? '');
    if (!id || target.kind !== 'address' || target.family !== w['family']) continue;
    const k = walletKey(target.family, target.address);
    if (seen.has(k)) continue;
    const chains = [...new Set(list(w['chains']).filter((c): c is string => typeof c === 'string' && families.get(c) === target.family))];
    if (!chains.length) continue;
    seen.add(k);
    wallets.push({
      id,
      address: target.address,
      family: target.family,
      label: str(w['label'], 80) || 'Imported wallet',
      ens: str(w['ens'], 255),
      chains,
      createdAt: typeof w['createdAt'] === 'number' && Number.isFinite(w['createdAt']) ? w['createdAt'] : Date.now(),
    });
  }

  return { wallets, tokens, customChains, rpcOverrides, settings: cleanSettings(data['settings']) };
}

function walletKey(family: ChainFamily, address: string): string {
  return `${family}:${family === 'sol' ? address : address.toLowerCase()}`;
}

function cleanSettings(v: unknown): Partial<Settings> {
  if (!isObj(v)) return {};
  const out: Partial<Settings> = {};
  const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
  if (num(v['refreshSec']) && (v['refreshSec'] as number) > 0) out.refreshSec = v['refreshSec'] as number;
  if (num(v['dustUsd'])) out.dustUsd = v['dustUsd'] as number;
  for (const k of ['hideDust', 'hideUnpriced', 'privacy', 'notify', 'paused'] as const) {
    if (typeof v[k] === 'boolean') out[k] = v[k] as boolean;
  }
  return out;
}
