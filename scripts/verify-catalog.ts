// Checks the built-in catalog against live endpoints: RPC reachability,
// on-chain decimals/symbol for every seeded token, and price coverage.
// Run with: npm run verify:catalog
import { createPublicClient, erc20Abi, http } from 'viem';
import { BUILTIN_CHAINS, MULTICALL3 } from '../src/app/core/chains.ts';
import { DEFAULT_TOKENS } from '../src/app/core/default-tokens.ts';
import { associatedTokenAddress } from '../src/app/core/providers/sol.ts';

let problems = 0;
const fail = (msg: string) => {
  problems++;
  console.log(`  FAIL ${msg}`);
};

for (const chain of BUILTIN_CHAINS.filter((c) => c.family === 'evm')) {
  console.log(`${chain.name}`);
  const client = createPublicClient({ transport: http(chain.rpcUrls[0], { timeout: 15_000 }) });
  try {
    const id = await client.getChainId();
    if (id !== chain.evmChainId) fail(`chain id ${id} != ${chain.evmChainId}`);
  } catch (e) {
    fail(`rpc ${chain.rpcUrls[0]}: ${(e as Error).message.split('\n')[0]}`);
    continue;
  }
  const tokens = DEFAULT_TOKENS.filter((t) => t.chainId === chain.id);
  const results = await client.multicall({
    multicallAddress: MULTICALL3,
    allowFailure: true,
    contracts: tokens.flatMap((t) => [
      { address: t.address as `0x${string}`, abi: erc20Abi, functionName: 'decimals' } as const,
      { address: t.address as `0x${string}`, abi: erc20Abi, functionName: 'symbol' } as const,
    ]),
  });
  tokens.forEach((t, i) => {
    const dec = results[i * 2];
    const sym = results[i * 2 + 1];
    if (dec.status !== 'success') return fail(`${t.symbol} ${t.address}: decimals() failed`);
    if (dec.result !== t.decimals) fail(`${t.symbol}: decimals ${dec.result} != ${t.decimals}`);
    console.log(`  ok   ${t.symbol.padEnd(8)} on-chain symbol=${sym.status === 'success' ? sym.result : '?'}`);
  });
}

const keys = [
  ...new Set([
    ...BUILTIN_CHAINS.map((c) => c.nativePriceKey!),
    ...DEFAULT_TOKENS.map((t) => `${BUILTIN_CHAINS.find((c) => c.id === t.chainId)!.llamaSlug}:${t.address}`),
  ]),
];
const res = await fetch(`https://coins.llama.fi/prices/current/${keys.join(',')}`);
const { coins } = (await res.json()) as { coins: Record<string, { price: number }> };
console.log(`Prices: ${Object.keys(coins).length}/${keys.length} keys priced`);
for (const k of keys) if (!coins[k]) fail(`no price for ${k}`);

for (const api of BUILTIN_CHAINS.find((c) => c.id === 'btc')!.rpcUrls) {
  try {
    const btc = await fetch(`${api}/address/bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh`, {
      signal: AbortSignal.timeout(10_000),
    });
    console.log(`bitcoin ${api}: ${btc.status}`);
  } catch (e) {
    console.log(`bitcoin ${api}: unreachable (${(e as Error).message})`);
  }
}
const solUrl = BUILTIN_CHAINS.find((c) => c.id === 'sol')!.rpcUrls[0];
const solRpc = async <T>(method: string, params: unknown[]): Promise<T> => {
  const res = await fetch(solUrl, {
    signal: AbortSignal.timeout(15_000),
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = (await res.json()) as { result: T; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
  return body.result;
};
type Parsed = { data: { parsed: { type: string; info: { decimals: number; mint: string; owner: string } } } } | null;
console.log('Solana');
const splSeeds = DEFAULT_TOKENS.filter((t) => t.chainId === 'sol');
const mintAccounts: Parsed[] = [];
for (let i = 0; i < splSeeds.length; i += 10) {
  const batch = splSeeds.slice(i, i + 10).map((t) => t.address);
  mintAccounts.push(...(await solRpc<{ value: Parsed[] }>('getMultipleAccounts', [batch, { encoding: 'jsonParsed' }])).value);
}
splSeeds.forEach((t, i) => {
  const acc = mintAccounts[i];
  if (acc?.data.parsed.type !== 'mint') return fail(`${t.symbol} ${t.address}: not a mint`);
  if (acc.data.parsed.info.decimals !== t.decimals) fail(`${t.symbol}: decimals ${acc.data.parsed.info.decimals} != ${t.decimals}`);
});
const owner = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const usdc = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const ata = await solRpc<{ value: Parsed }>('getAccountInfo', [associatedTokenAddress(owner, usdc), { encoding: 'jsonParsed' }]);
const info = ata.value?.data.parsed.info;
if (info?.owner !== owner || info?.mint !== usdc) fail('derived USDC associated token account does not match on-chain account');
else console.log(`  ok   ATA derivation matches on-chain account`);
console.log(`  ok   ${splSeeds.length} SPL mints checked`);

console.log(problems ? `\n${problems} problem(s)` : '\nAll checks passed');
process.exit(problems ? 1 : 0);
