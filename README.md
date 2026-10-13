# Watcher

Watch-only crypto portfolio tracker. You look at public wallets. You never touch them.

Watcher runs entirely in the browser. There is no server, no account, no WalletConnect, and no place to paste a key. It reads balances from public chain endpoints, prices them, and stores everything in IndexedDB on this machine.

It cannot send funds. It cannot sign. It cannot see a seed phrase.

## What it does

- Track public addresses on Ethereum and other EVM chains, Bitcoin, and Solana
- Show live native and listed-token balances, USD value, and 24h change
- Add extra tokens by contract or mint address
- Keep local history of portfolio value and balance changes
- Export / import a JSON backup of wallets, custom tokens, networks, and settings
- Hide amounts (privacy mode) and destroy every local row with a hold-to-confirm kill switch

Refresh is every 60 seconds by default. One tab leads; the others follow.

## What it will not do

- Ask for, store, or transmit private keys or seed phrases
- Connect a wallet or request a signature
- Send, receive, swap, or approve anything
- Upload your address book to a Watcher backend — there isn't one

Public RPCs and price APIs still see the addresses you choose to watch. That is inherent to reading a public chain.

## Run it

```bash
npm install
npm start
```

Open [http://localhost:4200/](http://localhost:4200/).

```bash
npm test          # Vitest
npm run build     # production bundle in dist/
```

Requires Node 20+.

## How it stays local

| Piece | Where it lives |
| --- | --- |
| Wallets, tokens, settings, balances, history | IndexedDB in this browser |
| Sync leadership across tabs | Web Locks, with a localStorage lease fallback |
| Cross-tab kill / refresh | BroadcastChannel |
| Backups | A JSON file you download yourself |

The kill switch deletes only Watcher data on this origin. Other sites are left alone. Because there is no server, destroyed data is gone.

## Stack

Angular 22 (zoneless, standalone, signals), Dexie, viem Multicall3, Bitcoin explorers, Solana JSON-RPC, DefiLlama prices.

## License

MIT
