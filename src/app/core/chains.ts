import {
  arbitrum,
  avalanche,
  base,
  bsc,
  gnosis,
  linea,
  mainnet,
  optimism,
  polygon,
  scroll,
} from 'viem/chains';

export type ChainFamily = 'evm' | 'btc' | 'sol';

export interface ChainDef {
  /** Stable key used everywhere in storage, e.g. `eth`, `base`, `evm:1234`. */
  id: string;
  family: ChainFamily;
  name: string;
  nativeSymbol: string;
  nativeDecimals: number;
  /** DefiLlama coin key for the native asset, e.g. `coingecko:ethereum`. */
  nativePriceKey?: string;
  /** DefiLlama chain slug used to price contract tokens (`<slug>:<address>`). */
  llamaSlug?: string;
  evmChainId?: number;
  rpcUrls: string[];
  explorer: string;
  color: string;
  custom?: boolean;
}

export const MULTICALL3 = '0xca11bde05977b3631167028862be2a173976ca11' as const;

export const BUILTIN_CHAINS: ChainDef[] = [
  {
    id: 'btc',
    family: 'btc',
    name: 'Bitcoin',
    nativeSymbol: 'BTC',
    nativeDecimals: 8,
    nativePriceKey: 'coingecko:bitcoin',
    rpcUrls: ['https://mempool.space/api', 'https://blockstream.info/api'],
    explorer: 'https://mempool.space',
    color: '#f2a03d',
  },
  {
    id: 'eth',
    family: 'evm',
    name: 'Ethereum',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    nativePriceKey: 'coingecko:ethereum',
    llamaSlug: 'ethereum',
    evmChainId: mainnet.id,
    rpcUrls: ['https://ethereum-rpc.publicnode.com', ...mainnet.rpcUrls.default.http],
    explorer: 'https://etherscan.io',
    color: '#6b7fd7',
  },
  {
    id: 'sol',
    family: 'sol',
    name: 'Solana',
    nativeSymbol: 'SOL',
    nativeDecimals: 9,
    nativePriceKey: 'coingecko:solana',
    llamaSlug: 'solana',
    rpcUrls: ['https://solana-rpc.publicnode.com'],
    explorer: 'https://solscan.io',
    color: '#9a6bd8',
  },
  {
    id: 'base',
    family: 'evm',
    name: 'Base',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    nativePriceKey: 'coingecko:ethereum',
    llamaSlug: 'base',
    evmChainId: base.id,
    rpcUrls: ['https://base-rpc.publicnode.com', ...base.rpcUrls.default.http],
    explorer: 'https://basescan.org',
    color: '#2f62e8',
  },
  {
    id: 'arb',
    family: 'evm',
    name: 'Arbitrum One',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    nativePriceKey: 'coingecko:ethereum',
    llamaSlug: 'arbitrum',
    evmChainId: arbitrum.id,
    rpcUrls: ['https://arbitrum-one-rpc.publicnode.com', ...arbitrum.rpcUrls.default.http],
    explorer: 'https://arbiscan.io',
    color: '#3b9fd6',
  },
  {
    id: 'op',
    family: 'evm',
    name: 'OP Mainnet',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    nativePriceKey: 'coingecko:ethereum',
    llamaSlug: 'optimism',
    evmChainId: optimism.id,
    rpcUrls: ['https://optimism-rpc.publicnode.com', ...optimism.rpcUrls.default.http],
    explorer: 'https://optimistic.etherscan.io',
    color: '#e0464a',
  },
  {
    id: 'polygon',
    family: 'evm',
    name: 'Polygon PoS',
    nativeSymbol: 'POL',
    nativeDecimals: 18,
    nativePriceKey: 'coingecko:polygon-ecosystem-token',
    llamaSlug: 'polygon',
    evmChainId: polygon.id,
    rpcUrls: ['https://polygon-bor-rpc.publicnode.com', ...polygon.rpcUrls.default.http],
    explorer: 'https://polygonscan.com',
    color: '#8a5ad6',
  },
  {
    id: 'bsc',
    family: 'evm',
    name: 'BNB Smart Chain',
    nativeSymbol: 'BNB',
    nativeDecimals: 18,
    nativePriceKey: 'coingecko:binancecoin',
    llamaSlug: 'bsc',
    evmChainId: bsc.id,
    rpcUrls: ['https://bsc-rpc.publicnode.com', ...bsc.rpcUrls.default.http],
    explorer: 'https://bscscan.com',
    color: '#d9a92a',
  },
  {
    id: 'avax',
    family: 'evm',
    name: 'Avalanche C-Chain',
    nativeSymbol: 'AVAX',
    nativeDecimals: 18,
    nativePriceKey: 'coingecko:avalanche-2',
    llamaSlug: 'avax',
    evmChainId: avalanche.id,
    rpcUrls: ['https://avalanche-c-chain-rpc.publicnode.com', ...avalanche.rpcUrls.default.http],
    explorer: 'https://snowtrace.io',
    color: '#d6504a',
  },
  {
    id: 'gnosis',
    family: 'evm',
    name: 'Gnosis',
    nativeSymbol: 'XDAI',
    nativeDecimals: 18,
    nativePriceKey: 'coingecko:xdai',
    llamaSlug: 'xdai',
    evmChainId: gnosis.id,
    rpcUrls: ['https://gnosis-rpc.publicnode.com', ...gnosis.rpcUrls.default.http],
    explorer: 'https://gnosisscan.io',
    color: '#2f8a6a',
  },
  {
    id: 'linea',
    family: 'evm',
    name: 'Linea',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    nativePriceKey: 'coingecko:ethereum',
    llamaSlug: 'linea',
    evmChainId: linea.id,
    rpcUrls: ['https://linea-rpc.publicnode.com', ...linea.rpcUrls.default.http],
    explorer: 'https://lineascan.build',
    color: '#4a5560',
  },
  {
    id: 'scroll',
    family: 'evm',
    name: 'Scroll',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    nativePriceKey: 'coingecko:ethereum',
    llamaSlug: 'scroll',
    evmChainId: scroll.id,
    rpcUrls: ['https://scroll-rpc.publicnode.com', ...scroll.rpcUrls.default.http],
    explorer: 'https://scrollscan.com',
    color: '#c9925a',
  },
];

export const DEFAULT_EVM_SELECTION = ['eth', 'base', 'arb', 'op', 'polygon'];

export function explorerAddressUrl(chain: ChainDef, address: string): string {
  switch (chain.family) {
    case 'btc':
      return `${chain.explorer}/address/${address}`;
    case 'sol':
      return `${chain.explorer}/account/${address}`;
    default:
      return `${chain.explorer.replace(/\/$/, '')}/address/${address}`;
  }
}

export function explorerTokenUrl(chain: ChainDef, token: string): string {
  return chain.family === 'sol'
    ? `${chain.explorer}/token/${token}`
    : `${chain.explorer.replace(/\/$/, '')}/token/${token}`;
}
