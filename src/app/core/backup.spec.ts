import { sanitizeBackup } from './backup';

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

function backup(extra: Record<string, unknown>) {
  return { app: 'watcher', version: 1, wallets: [], tokens: [], customChains: [], rpcOverrides: [], ...extra };
}

const token = (decimals: number) => ({ key: `eth:${USDC}`, chainId: 'eth', address: USDC, symbol: 'USDC', name: 'USD Coin', decimals, source: 'custom' });

describe('sanitizeBackup', () => {
  it('keeps a valid https RPC override', () => {
    const r = sanitizeBackup(backup({ rpcOverrides: [{ chainId: 'eth', url: 'https://rpc.example.org' }] }), []);
    expect(r.rpcOverrides).toEqual([{ chainId: 'eth', url: 'https://rpc.example.org' }]);
  });

  it('rejects a plain http override to a remote host', () => {
    const r = sanitizeBackup(backup({ rpcOverrides: [{ chainId: 'eth', url: 'http://evil.example' }] }), []);
    expect(r.rpcOverrides).toEqual([]);
  });

  it('rejects javascript: URLs in overrides and custom chains', () => {
    const r = sanitizeBackup(
      backup({
        rpcOverrides: [{ chainId: 'eth', url: 'javascript:alert(1)' }],
        customChains: [{ id: 'evm:5000', family: 'evm', evmChainId: 5000, name: 'X', rpcUrls: ['javascript:alert(1)'], explorer: '' }],
      }),
      [],
    );
    expect(r.rpcOverrides).toEqual([]);
    expect(r.customChains).toEqual([]);
  });

  it('rejects token decimals outside 0..36', () => {
    expect(sanitizeBackup(backup({ tokens: [token(-1)] }), []).tokens).toEqual([]);
    expect(sanitizeBackup(backup({ tokens: [token(1e9)] }), []).tokens).toEqual([]);
    expect(sanitizeBackup(backup({ tokens: [token(6)] }), []).tokens).toHaveLength(1);
  });

  it('drops malformed wallets and keeps valid ones with only known chains', () => {
    const r = sanitizeBackup(
      backup({
        wallets: [
          { id: 'ok', family: 'evm', address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', label: 'V', chains: ['eth', 'nope', 'btc'], createdAt: 1 },
          { id: 'bad', family: 'evm', address: 'not-an-address', chains: ['eth'] },
          { id: 'mismatch', family: 'sol', address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', chains: ['sol'] },
          'garbage',
        ],
      }),
      [],
    );
    expect(r.wallets.map((w) => w.id)).toEqual(['ok']);
    expect(r.wallets[0].chains).toEqual(['eth']);
  });

  it('refuses files that are not Watcher backups', () => {
    expect(() => sanitizeBackup({ app: 'other' }, [])).toThrow('not a Watcher backup');
  });

  it('still accepts backups written under the brief Spyglass name', () => {
    expect(sanitizeBackup({ app: 'spyglass', wallets: [] }, []).wallets).toEqual([]);
  });
});
