export interface TokenSeed {
  chainId: string;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

type Row = [address: string, symbol: string, name: string, decimals: number];

const LISTS: Record<string, Row[]> = {
  eth: [
    ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 'USDC', 'USD Coin', 6],
    ['0xdac17f958d2ee523a2206206994597c13d831ec7', 'USDT', 'Tether USD', 6],
    ['0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', 'WETH', 'Wrapped Ether', 18],
    ['0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', 'WBTC', 'Wrapped BTC', 8],
    ['0x6b175474e89094c44da98b954eedeac495271d0f', 'DAI', 'Dai Stablecoin', 18],
    ['0xae7ab96520de3a18e5e111b5eaab095312d7fe84', 'stETH', 'Lido Staked Ether', 18],
    ['0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0', 'wstETH', 'Wrapped stETH', 18],
    ['0x4c9edd5852cd905f086c759e8383e09bff1e68b3', 'USDe', 'Ethena USDe', 18],
    ['0x514910771af9ca656af840dff83e8264ecf986ca', 'LINK', 'Chainlink', 18],
    ['0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', 'UNI', 'Uniswap', 18],
    ['0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', 'AAVE', 'Aave', 18],
    ['0x6982508145454ce325ddbe47a25d4ec3d2311933', 'PEPE', 'Pepe', 18],
    ['0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce', 'SHIB', 'Shiba Inu', 18],
  ],
  base: [
    ['0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 'USDC', 'USD Coin', 6],
    ['0x4200000000000000000000000000000000000006', 'WETH', 'Wrapped Ether', 18],
    ['0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf', 'cbBTC', 'Coinbase Wrapped BTC', 8],
    ['0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22', 'cbETH', 'Coinbase Wrapped Staked ETH', 18],
    ['0x50c5725949a6f0c72e6c4a641f24049a917db0cb', 'DAI', 'Dai Stablecoin', 18],
    ['0x940181a94a35a4569e4529a3cdfb74e38fd98631', 'AERO', 'Aerodrome', 18],
    ['0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca', 'USDbC', 'USD Base Coin', 6],
  ],
  arb: [
    ['0xaf88d065e77c8cc2239327c5edb3a432268e5831', 'USDC', 'USD Coin', 6],
    ['0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', 'USDT', 'Tether USD', 6],
    ['0x82af49447d8a07e3bd95bd0d56f35241523fbab1', 'WETH', 'Wrapped Ether', 18],
    ['0x912ce59144191c1204e64559fe8253a0e49e6548', 'ARB', 'Arbitrum', 18],
    ['0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f', 'WBTC', 'Wrapped BTC', 8],
    ['0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', 'USDC.e', 'Bridged USDC', 6],
    ['0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a', 'GMX', 'GMX', 18],
  ],
  op: [
    ['0x0b2c639c533813f4aa9d7837caf62653d097ff85', 'USDC', 'USD Coin', 6],
    ['0x94b008aa00579c1307b0ef2c499ad98a8ce58e58', 'USDT', 'Tether USD', 6],
    ['0x4200000000000000000000000000000000000006', 'WETH', 'Wrapped Ether', 18],
    ['0x4200000000000000000000000000000000000042', 'OP', 'Optimism', 18],
    ['0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', 'DAI', 'Dai Stablecoin', 18],
    ['0x68f180fcce6836688e9084f035309e29bf0a2095', 'WBTC', 'Wrapped BTC', 8],
  ],
  polygon: [
    ['0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', 'USDC', 'USD Coin', 6],
    ['0xc2132d05d31c914a87c6611c10748aeb04b58e8f', 'USDT', 'Tether USD', 6],
    ['0x7ceb23fd6bc0add59e62ac25578270cff1b9f619', 'WETH', 'Wrapped Ether', 18],
    ['0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6', 'WBTC', 'Wrapped BTC', 8],
    ['0x2791bca1f2de4661ed88a30c99a7a9449aa84174', 'USDC.e', 'Bridged USDC', 6],
    ['0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', 'WPOL', 'Wrapped POL', 18],
    ['0x8f3cf7ad23cd3cadbd9735aff958023239c6a063', 'DAI', 'Dai Stablecoin', 18],
  ],
  bsc: [
    ['0x55d398326f99059ff775485246999027b3197955', 'USDT', 'Tether USD', 18],
    ['0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', 'USDC', 'USD Coin', 18],
    ['0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', 'WBNB', 'Wrapped BNB', 18],
    ['0x2170ed0880ac9a755fd29b2688956bd959f933f8', 'ETH', 'Binance-Peg Ether', 18],
    ['0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c', 'BTCB', 'Binance-Peg BTC', 18],
    ['0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82', 'CAKE', 'PancakeSwap', 18],
  ],
  avax: [
    ['0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e', 'USDC', 'USD Coin', 6],
    ['0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7', 'USDT', 'Tether USD', 6],
    ['0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7', 'WAVAX', 'Wrapped AVAX', 18],
    ['0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab', 'WETH.e', 'Bridged Ether', 18],
    ['0x152b9d0fdc40c096757f570a51e494bd4b943e50', 'BTC.b', 'Bitcoin (bridged)', 8],
  ],
  gnosis: [
    ['0xddafbb505ad214d7b80b1f830fccc89b60fb7a83', 'USDC', 'USD Coin', 6],
    ['0x6a023ccd1ff6f2045c3309768ead9e68f978f6e1', 'WETH', 'Wrapped Ether', 18],
    ['0x9c58bacc331c9aa871afd802db6379a98e80cedb', 'GNO', 'Gnosis', 18],
  ],
  linea: [
    ['0x176211869ca2b568f2a7d4ee941e073a821ee1ff', 'USDC', 'USD Coin', 6],
    ['0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f', 'WETH', 'Wrapped Ether', 18],
  ],
  scroll: [
    ['0x06efdbff2a14a7c8e15944d1f4a48f9f95f663a4', 'USDC', 'USD Coin', 6],
    ['0x5300000000000000000000000000000000000004', 'WETH', 'Wrapped Ether', 18],
  ],
  sol: [
    ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'USDC', 'USD Coin', 6],
    ['Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', 'USDT', 'Tether USD', 6],
    ['So11111111111111111111111111111111111111112', 'wSOL', 'Wrapped SOL', 9],
    ['J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', 'JitoSOL', 'Jito Staked SOL', 9],
    ['mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', 'mSOL', 'Marinade Staked SOL', 9],
    ['bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1', 'bSOL', 'BlazeStake Staked SOL', 9],
    ['JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', 'JUP', 'Jupiter', 6],
    ['jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL', 'JTO', 'Jito', 9],
    ['DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 'BONK', 'Bonk', 5],
    ['EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', 'WIF', 'dogwifhat', 6],
    ['HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3', 'PYTH', 'Pyth Network', 6],
    ['4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', 'RAY', 'Raydium', 6],
    ['rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof', 'RENDER', 'Render', 8],
    ['85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ', 'W', 'Wormhole', 6],
    ['2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo', 'PYUSD', 'PayPal USD', 6],
  ],
};

export const DEFAULT_TOKENS: TokenSeed[] = Object.entries(LISTS).flatMap(([chainId, rows]) =>
  rows.map(([address, symbol, name, decimals]) => ({ chainId, address, symbol, name, decimals })),
);
