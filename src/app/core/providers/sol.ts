import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha2';
import { base58 } from '@scure/base';

const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const PDA_MARKER = new TextEncoder().encode('ProgramDerivedAddress');
/** Free public endpoints reject larger `getMultipleAccounts` batches. */
const MAX_ACCOUNTS_PER_CALL = 10;

async function rpc<T>(urls: string[], method: string, params: unknown[]): Promise<T> {
  let lastErr: unknown;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await res.json().catch(() => ({}))) as { result?: T; error?: { message: string } };
      if (body.error) throw new Error(body.error.message);
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
      return body.result as T;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Solana RPC unreachable');
}

function isOnCurve(bytes: Uint8Array): boolean {
  try {
    ed25519.ExtendedPoint.fromHex(bytes);
    return true;
  } catch {
    return false;
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Solana `findProgramAddress`: the first off-curve sha256(seeds, bump, program, marker). */
export function findProgramAddress(seeds: Uint8Array[], programId: Uint8Array): Uint8Array {
  for (let bump = 255; bump >= 0; bump--) {
    const hash = sha256(concat([...seeds, Uint8Array.of(bump), programId, PDA_MARKER]));
    if (!isOnCurve(hash)) return hash;
  }
  throw new Error('Unable to find a viable program address');
}

export function associatedTokenAddress(owner: string, mint: string, tokenProgram = TOKEN_PROGRAM): string {
  return base58.encode(
    findProgramAddress([base58.decode(owner), base58.decode(tokenProgram), base58.decode(mint)], base58.decode(ATA_PROGRAM)),
  );
}

interface ParsedTokenAccount {
  data: { parsed?: { type: string; info: { mint: string; owner: string; tokenAmount: { amount: string; decimals: number } } } };
}

export interface SolBalance {
  lamports: bigint;
  tokens: Map<string, { raw: bigint; decimals: number }>;
  /** True when every token account was enumerated; false when only known mints were checked. */
  complete: boolean;
}

/** Endpoint sets that refuse `getTokenAccountsByOwner` (most free public RPCs do). */
const scanBlocked = new Set<string>();

export async function readSolBalance(urls: string[], owner: string, knownMints: string[]): Promise<SolBalance> {
  const bal = await rpc<{ value: number }>(urls, 'getBalance', [owner, { commitment: 'confirmed' }]);
  const lamports = BigInt(bal.value);
  const key = urls.join(',');

  if (!scanBlocked.has(key)) {
    try {
      const programs = await Promise.all(
        [TOKEN_PROGRAM, TOKEN_2022_PROGRAM].map((programId) =>
          rpc<{ value: { account: ParsedTokenAccount }[] }>(urls, 'getTokenAccountsByOwner', [
            owner,
            { programId },
            { encoding: 'jsonParsed', commitment: 'confirmed' },
          ]),
        ),
      );
      const tokens = new Map<string, { raw: bigint; decimals: number }>();
      for (const p of programs) for (const { account } of p.value) addParsed(tokens, account, owner);
      return { lamports, tokens, complete: true };
    } catch {
      scanBlocked.add(key);
    }
  }

  const mints = [...new Set(knownMints)];
  await learnMintPrograms(urls, mints);
  const atas = mints.map((m) => associatedTokenAddress(owner, m, mintPrograms.get(m) ?? TOKEN_PROGRAM));
  const tokens = new Map<string, { raw: bigint; decimals: number }>();
  const batches = await Promise.all(
    chunk(atas, MAX_ACCOUNTS_PER_CALL).map((batch) =>
      rpc<{ value: (ParsedTokenAccount | null)[] }>(urls, 'getMultipleAccounts', [batch, { encoding: 'jsonParsed', commitment: 'confirmed' }]),
    ),
  );
  for (const res of batches) for (const acc of res.value) if (acc) addParsed(tokens, acc, owner);
  for (const m of mints) if (!tokens.has(m)) tokens.set(m, { raw: 0n, decimals: 0 });
  return { lamports, tokens, complete: false };
}

/** Mint address → owning token program (classic SPL or Token-2022). */
const mintPrograms = new Map<string, string>();

async function learnMintPrograms(urls: string[], mints: string[]): Promise<void> {
  const unknown = mints.filter((m) => !mintPrograms.has(m));
  await Promise.all(
    chunk(unknown, MAX_ACCOUNTS_PER_CALL).map(async (batch) => {
      const res = await rpc<{ value: ({ owner: string } | null)[] }>(urls, 'getMultipleAccounts', [
        batch,
        { encoding: 'base64', dataSlice: { offset: 0, length: 0 } },
      ]);
      batch.forEach((m, i) => mintPrograms.set(m, res.value[i]?.owner === TOKEN_2022_PROGRAM ? TOKEN_2022_PROGRAM : TOKEN_PROGRAM));
    }),
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function addParsed(tokens: Map<string, { raw: bigint; decimals: number }>, acc: ParsedTokenAccount, owner: string): void {
  const parsed = acc.data.parsed;
  if (parsed?.type !== 'account' || parsed.info.owner !== owner) return;
  const raw = BigInt(parsed.info.tokenAmount.amount);
  const prev = tokens.get(parsed.info.mint);
  tokens.set(parsed.info.mint, { raw: (prev?.raw ?? 0n) + raw, decimals: parsed.info.tokenAmount.decimals });
}

export function isTokenScanBlocked(urls: string[]): boolean {
  return scanBlocked.has(urls.join(','));
}

export async function readSplMint(urls: string[], mint: string): Promise<{ decimals: number }> {
  const res = await rpc<{
    value: { data: { parsed?: { type: string; info: { decimals: number } } } } | null;
  }>(urls, 'getAccountInfo', [mint, { encoding: 'jsonParsed' }]);
  const parsed = res.value?.data.parsed;
  if (!parsed || parsed.type !== 'mint') throw new Error('Not an SPL token mint');
  return { decimals: parsed.info.decimals };
}
