import {
  createPublicClient,
  erc20Abi,
  fallback,
  http,
  parseAbi,
  type Address,
  type PublicClient,
} from 'viem';
import { normalize } from 'viem/ens';
import { mainnet } from 'viem/chains';
import { MULTICALL3, type ChainDef } from '../chains';

const multicall3Abi = parseAbi([
  'function getEthBalance(address addr) view returns (uint256 balance)',
  'function getBlockNumber() view returns (uint256 blockNumber)',
]);

const clients = new Map<string, PublicClient>();

export function rpcUrlsFor(chain: ChainDef, override?: string): string[] {
  return [...new Set([override, ...chain.rpcUrls].filter((u): u is string => !!u))];
}

export function evmClient(chain: ChainDef, override?: string): PublicClient {
  const urls = rpcUrlsFor(chain, override);
  const key = `${chain.id}|${urls.join(',')}`;
  let client = clients.get(key);
  if (!client) {
    client = createPublicClient({
      chain: chain.id === 'eth' ? mainnet : undefined,
      transport: fallback(
        urls.map((u) => http(u, { timeout: 12_000, retryCount: 1 })),
        { rank: false },
      ),
    });
    clients.set(key, client);
  }
  return client;
}

export interface EvmWalletResult {
  native: bigint;
  /** Successful `balanceOf` reads, including real zeros. */
  tokens: Map<string, bigint>;
  /** Tokens whose `balanceOf` call failed; their stored balances must be left alone. */
  failed: string[];
}

export interface EvmChainResult {
  block?: bigint;
  wallets: Map<string, EvmWalletResult>;
}

/**
 * Reads native + ERC-20 balances for many addresses on one chain. Uses a single
 * Multicall3 batch when available and falls back to individual calls otherwise.
 */
export async function readEvmBalances(
  client: PublicClient,
  addresses: string[],
  tokens: string[],
): Promise<EvmChainResult> {
  const out: EvmChainResult = { wallets: new Map() };
  try {
    const contracts = [
      { address: MULTICALL3, abi: multicall3Abi, functionName: 'getBlockNumber' } as const,
      ...addresses.flatMap((owner) => [
        {
          address: MULTICALL3,
          abi: multicall3Abi,
          functionName: 'getEthBalance',
          args: [owner as Address],
        } as const,
        ...tokens.map(
          (t) =>
            ({
              address: t as Address,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [owner as Address],
            }) as const,
        ),
      ]),
    ];
    const res = await client.multicall({
      contracts,
      allowFailure: true,
      multicallAddress: MULTICALL3,
      batchSize: 8_192,
    });
    if (res[0].status !== 'success') throw new Error('multicall unavailable');
    out.block = res[0].result as bigint;
    const stride = tokens.length + 1;
    addresses.forEach((owner, i) => {
      const base = 1 + i * stride;
      const nat = res[base];
      if (nat.status !== 'success') throw new Error('native balance failed');
      const map = new Map<string, bigint>();
      const failed: string[] = [];
      tokens.forEach((t, j) => {
        const r = res[base + 1 + j];
        if (r.status === 'success') map.set(t, r.result as bigint);
        else failed.push(t);
      });
      out.wallets.set(owner, { native: nat.result as bigint, tokens: map, failed });
    });
    return out;
  } catch (err) {
    if (isNetworkError(err)) throw err;
  }

  out.block = await client.getBlockNumber();
  await Promise.all(
    addresses.map(async (owner) => {
      const native = await client.getBalance({ address: owner as Address });
      const map = new Map<string, bigint>();
      const failed: string[] = [];
      await Promise.all(
        tokens.map(async (t) => {
          try {
            const bal = await client.readContract({
              address: t as Address,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [owner as Address],
            });
            map.set(t, bal);
          } catch {
            failed.push(t);
          }
        }),
      );
      out.wallets.set(owner, { native, tokens: map, failed });
    }),
  );
  return out;
}

function isNetworkError(err: unknown): boolean {
  for (let e = err as { name?: string; cause?: unknown } | undefined; e; e = e.cause as typeof e) {
    if (/HttpRequestError|TimeoutError|AbortError/.test(e.name ?? '')) return true;
  }
  return false;
}

export interface Erc20Meta {
  symbol: string;
  name: string;
  decimals: number;
}

export async function readErc20Meta(client: PublicClient, address: string): Promise<Erc20Meta> {
  const a = address as Address;
  const [decimals, symbol, name] = await Promise.all([
    client.readContract({ address: a, abi: erc20Abi, functionName: 'decimals' }),
    client.readContract({ address: a, abi: erc20Abi, functionName: 'symbol' }).catch(() => '???'),
    client.readContract({ address: a, abi: erc20Abi, functionName: 'name' }).catch(() => ''),
  ]);
  return { decimals: Number(decimals), symbol: String(symbol), name: String(name) };
}

export async function resolveEns(client: PublicClient, name: string): Promise<string | null> {
  return client.getEnsAddress({ name: normalize(name) });
}

export async function reverseEns(client: PublicClient, address: string): Promise<string | null> {
  try {
    return await client.getEnsName({ address: address as Address });
  } catch {
    return null;
  }
}

/** Whether an address has any history on a chain (nonce or balance). */
export async function hasActivity(client: PublicClient, address: string): Promise<boolean> {
  const a = address as Address;
  const [nonce, bal] = await Promise.all([
    client.getTransactionCount({ address: a }),
    client.getBalance({ address: a }),
  ]);
  return nonce > 0 || bal > 0n;
}

export async function probeRpc(url: string): Promise<{ chainId: number; ms: number; block: bigint }> {
  const client = createPublicClient({ transport: http(url, { timeout: 8_000, retryCount: 0 }) });
  const t0 = performance.now();
  const [chainId, block] = await Promise.all([client.getChainId(), client.getBlockNumber()]);
  return { chainId, block, ms: Math.round(performance.now() - t0) };
}
