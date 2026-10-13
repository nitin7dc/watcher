import { bech32m } from '@scure/base';
import { parseTarget } from './address';

const taproot = (hrp: string) => bech32m.encode(hrp, [1, ...bech32m.toWords(new Uint8Array(32).fill(7))]);

describe('parseTarget, Bitcoin', () => {
  it.each([
    ['segwit v0', 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'],
    ['P2PKH', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'],
    ['P2SH', '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy'],
    ['taproot', taproot('bc')],
  ])('accepts a valid %s address', (_kind, address) => {
    expect(parseTarget(address)).toEqual({ kind: 'address', family: 'btc', address: address.toLowerCase().startsWith('bc1') ? address.toLowerCase() : address });
  });

  it('accepts an all-uppercase bech32 address', () => {
    expect(parseTarget('BC1QXY2KGDYGJRSQTZQ2N0YRF2493P83KKFJHX0WLH')).toEqual({ kind: 'address', family: 'btc', address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' });
  });

  it.each([
    ['bech32', 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlj'],
    ['base58check', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb'],
  ])('rejects a one-character %s typo', (_kind, address) => {
    expect(parseTarget(address)).toEqual({ kind: 'invalid', reason: 'Bitcoin address checksum does not match' });
  });

  it('does not accept testnet addresses', () => {
    expect(parseTarget(taproot('tb')).kind).toBe('invalid');
  });
});

describe('parseTarget, other families', () => {
  it('rejects an EVM address whose mixed-case checksum is wrong', () => {
    expect(parseTarget('0xD8dA6BF26964aF9D7eEd9e03E53415D37aA96045')).toEqual({ kind: 'invalid', reason: 'Checksum does not match' });
  });

  it('accepts a checksummed EVM address and a Solana address', () => {
    expect(parseTarget('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045').kind).toBe('address');
    expect(parseTarget('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM')).toEqual({ kind: 'address', family: 'sol', address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM' });
  });
});
