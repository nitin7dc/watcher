import type { ChainDef, ChainFamily } from './chains';

export interface Wallet {
  id: string;
  address: string;
  family: ChainFamily;
  label: string;
  ens?: string;
  chains: string[];
  createdAt: number;
}

export type TokenSource = 'default' | 'custom' | 'discovered';

export interface Token {
  /** `${chainId}:${address}` — EVM addresses lowercase, Solana mints as-is. */
  key: string;
  chainId: string;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  source: TokenSource;
  hidden?: boolean;
  addedAt: number;
}

export const NATIVE = 'native';

export interface Balance {
  /** `${walletId}|${chainId}|${asset}` where asset is `native` or a token address. */
  key: string;
  walletId: string;
  chainId: string;
  asset: string;
  raw: string;
  decimals: number;
  amount: number;
  updatedAt: number;
}

export interface SyncRecord {
  /** `${walletId}|${chainId}` */
  key: string;
  walletId: string;
  chainId: string;
  ok: boolean;
  error?: string;
  updatedAt: number;
  lastOkAt?: number;
  /** Assets checked on the last partial read; first sightings of anything else are a baseline, not a change. */
  checked?: string[];
}

export interface Price {
  key: string;
  price: number;
  symbol?: string;
  change24h?: number;
  updatedAt: number;
}

export interface Snapshot {
  ts: number;
  totalUsd: number;
  /** Value per wallet id, so history can be compared over a fixed set of wallets. */
  wallets?: Record<string, number>;
}

export interface Activity {
  id?: number;
  ts: number;
  walletId: string;
  chainId: string;
  asset: string;
  symbol: string;
  delta: number;
  amount: number;
  usd?: number;
}

export interface RpcOverride {
  chainId: string;
  url: string;
}

export type CustomChain = ChainDef & { custom: true };

export interface Settings {
  refreshSec: number;
  hideDust: boolean;
  dustUsd: number;
  hideUnpriced: boolean;
  privacy: boolean;
  notify: boolean;
  paused: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  refreshSec: 60,
  hideDust: true,
  dustUsd: 1,
  hideUnpriced: true,
  privacy: false,
  notify: false,
  paused: false,
};

export const balanceKey = (walletId: string, chainId: string, asset: string) =>
  `${walletId}|${chainId}|${asset}`;
export const syncKey = (walletId: string, chainId: string) => `${walletId}|${chainId}`;
export const tokenKey = (chainId: string, address: string) => `${chainId}:${address}`;
