import Dexie, { type EntityTable, type Table } from 'dexie';
import { DEFAULT_TOKENS } from './default-tokens';
import type {
  Activity,
  Balance,
  CustomChain,
  Price,
  RpcOverride,
  Settings,
  Snapshot,
  SyncRecord,
  Token,
  Wallet,
} from './models';

export const DB_NAME = 'watcher';

export class WatcherDb extends Dexie {
  wallets!: EntityTable<Wallet, 'id'>;
  tokens!: EntityTable<Token, 'key'>;
  balances!: EntityTable<Balance, 'key'>;
  syncs!: EntityTable<SyncRecord, 'key'>;
  prices!: EntityTable<Price, 'key'>;
  snapshots!: EntityTable<Snapshot, 'ts'>;
  activity!: EntityTable<Activity, 'id'>;
  customChains!: EntityTable<CustomChain, 'id'>;
  rpcOverrides!: EntityTable<RpcOverride, 'chainId'>;
  settings!: EntityTable<{ key: string; value: Settings }, 'key'>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      wallets: 'id, address, createdAt',
      tokens: 'key, chainId',
      balances: 'key, walletId, chainId',
      syncs: 'key, walletId',
      prices: 'key',
      snapshots: 'ts',
      activity: '++id, ts, walletId',
      customChains: 'id',
      rpcOverrides: 'chainId',
      settings: 'key',
    });

    this.version(2)
      .stores({})
      .upgrade((tx) => seedDefaultTokens(tx.table('tokens')));

    this.on('populate', (tx) => seedDefaultTokens(tx.table('tokens')));
  }
}

/** Adds any built-in token that isn't stored yet, leaving user changes (like hidden) intact. */
async function seedDefaultTokens(table: Table<Token, string>): Promise<void> {
  const now = Date.now();
  const rows: Token[] = DEFAULT_TOKENS.map((t) => ({ ...t, key: `${t.chainId}:${t.address}`, source: 'default', addedAt: now }));
  const existing = new Set(await table.bulkGet(rows.map((r) => r.key)).then((found) => found.filter((t) => !!t).map((t) => t.key)));
  await table.bulkAdd(rows.filter((r) => !existing.has(r.key)));
}

export const db = new WatcherDb();
