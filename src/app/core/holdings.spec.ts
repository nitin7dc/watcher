import { groupAssets, type Holding } from './holdings';

function h(p: Partial<Holding> & Pick<Holding, 'chainId' | 'asset' | 'source'>): Holding {
  return { key: `w|${p.chainId}|${p.asset}`, walletId: 'w', symbol: 'USDC', name: '', amount: 10, price: 1, usd: 10, hidden: false, ...p };
}

describe('groupAssets', () => {
  it('merges built-in USDC across chains but keeps a priced custom USDC look-alike separate', () => {
    const groups = groupAssets([
      h({ chainId: 'eth', asset: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', source: 'default' }),
      h({ chainId: 'base', asset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', source: 'default' }),
      h({ chainId: 'base', asset: '0x1111111111111111111111111111111111111111', source: 'custom', usd: 999, amount: 999 }),
    ]);

    const catalog = groups.find((g) => g.id === 'sym:USDC');
    expect(catalog?.chains.sort()).toEqual(['base', 'eth']);
    expect(catalog?.usd).toBe(20);
    expect(groups.find((g) => g.id === 'asset:base:0x1111111111111111111111111111111111111111')?.usd).toBe(999);
    expect(groups).toHaveLength(2);
  });

  it('keeps discovered tokens per contract even when priced', () => {
    const groups = groupAssets([
      h({ chainId: 'sol', asset: 'MintA', source: 'discovered' }),
      h({ chainId: 'sol', asset: 'MintB', source: 'discovered' }),
    ]);
    expect(groups).toHaveLength(2);
  });
});
