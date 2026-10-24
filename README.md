<p align="center"><img src="brand/logo-500.png" width="120" alt="Nero"></p>

<h1 align="center">Nero</h1>

<p align="center"><a href="https://github.com/minseochoj/nero/actions/workflows/test.yml"><img src="https://github.com/minseochoj/nero/actions/workflows/test.yml/badge.svg" alt="tests"></a></p>

<p align="center"><b>Solana in. Monero out.</b><br>Any Solana token into real XMR at your own Monero address, paid from our own Monero node.<br>Your Monero address never appears on Solana.</p>

---

Nero is a swap from Solana to Monero. You send a Solana token; our solver pays real XMR from its own Monero wallet, through a Monero node we run ourselves. The Monero address is sealed in your browser before it leaves, so it never appears on Solana.

This repository is everything that runs: the website and the solver. It is public so you can read what it does, run the tests, check the keys it uses and verify each payment yourself.

- **Site:** `site/`, Next.js. The swap page, the docs, the Verify page.
- **Solver:** `solver/`, Node. Watches the deposit wallet, pays XMR or refunds SOL.
- **Deploy:** `deploy/`, the service files for the solver, its wallet and the Monero node.

## Contents

- [How an exit works](#how-an-exit-works)
- [What you trust, and what you can check](#what-you-trust-and-what-you-can-check)
- [Verify it yourself](#verify-it-yourself)
- [Public keys](#public-keys)
- [Repository layout](#repository-layout)
- [Run it locally](#run-it-locally)
- [Run your own](#run-your-own)
- [Money safety in the solver](#money-safety-in-the-solver)
- [Fees](#fees)
- [Security](#security)
- [License](#license)

## How an exit works

There are three routes. The private exit is the default.

### Private exit

```
your wallet ──(one Solana transaction)──▶ solver deposit wallet
   │                                              │
   │  swap to SOL + transfer + memo               │  deposit is final (~15 s)
   │  memo = Monero address sealed to the         ▼
   │  solver's X25519 key, in your browser   solver opens the address,
   │                                         pays XMR from its own wallet,
   ▼                                         through our own Monero node
your Monero wallet ◀───────────── real XMR ──────┘
```

1. **Quote.** The site asks the solver for a quote: the exact XMR you get, fee included, valid 60 seconds, bound to your wallet. The solver checks the pool price against two independent price feeds before it offers one.
2. **Seal.** Your browser seals your Monero address with the solver's public key (NaCl box, X25519). The key is written in this repository (`site/lib/v2.ts`), not fetched, so a compromised server cannot swap it at order time.
3. **Promise.** The solver signs a short text with the deposit wallet's own ed25519 key: what you send, what you get, until when, where a refund goes, and a hash of the sealed address. Your browser checks the signature and every line against the quote. If anything is off, it stops before your wallet sees a transaction.
4. **Build and check.** Your browser builds the transaction itself: the swap instructions straight from the router, then the transfer and the memo. Before your wallet is asked to sign, the page checks that you pay the fee, that only the expected programs appear, and that exactly the quoted SOL goes to the pinned deposit wallet.
5. **Pay or refund.** Once the deposit is final on Solana, the solver pays the quoted XMR. If anything does not match (late, short, unreadable address, not enough XMR on hand), it refunds the SOL to the sender, minus the network fee.
6. **Proof.** The order page shows the Monero transaction and its tx key, only to the browser that holds the order secret. Any Monero wallet can check them against your address.

**No wallet connection.** The same exit with a one-time Solana deposit address per order (derived from a seed, never reused). Send SOL from any wallet or exchange. The quote is held 15 minutes, and a Solana refund address is required.

### Standard exit

For orders larger than the solver can cover. One Solana transaction: a Jupiter swap into wXMR, then the [wXMR bridge](https://wxmr.io)'s `request_withdrawal` to your Monero address. The bridge is a third party. This route names your Monero address on Solana.

### Enter

XMR into wXMR on Solana, through the same bridge: your wallet opens a deposit account, gets its own Monero subaddress, and receives wXMR for what you send.

## What you trust, and what you can check

Nero is **not trustless**, and does not say it is. On the private exit, you trust our solver for the seconds between your deposit and its payout: to pay you, or to refund you if it cannot. Monero has no smart contracts, so no program on either chain can force that payout today.

What Nero does instead is keep that trust **small, short and checkable**:

| Claim | How you check it, without us |
|---|---|
| The site runs this code | The footer names the commit it was built from. |
| The solver runs this code | `GET /api/v2/info` returns `version`, the commit it runs. |
| Your address is sealed to the right key | The key is in `site/lib/v2.ts`. The Verify page compares it with what the solver reports. |
| We run our own Monero node | `GET /api/node` returns our node's top block and the same block from a public node we do not run. Same hash at the same height means our node is on the real chain. |
| The order terms are what you were shown | Every order carries a promise signed by the public deposit wallet. Check it on the Verify page or with any ed25519 library. |
| You were paid | The tx hash and tx key prove the payment in any Monero wallet (`check_tx_key`). |
| Deposits and refunds | Every one is a public Solana transaction to or from the deposit wallet. |

What cannot be proven from the outside:

- **That a server runs exactly this code.** The reported commit is the server's word. Everything else in the table does not depend on it.
- **The solver's exact reserve.** We publish it as a number, not as a Monero reserve proof, on purpose: a reserve proof reveals key images, which would mark our payout transactions on the Monero chain and weaken users' privacy after the exit. Per-order and daily caps are the protection instead.

## Verify it yourself

The fastest way is the **Verify page** (`/verify`) on the live site. It reads everything from your browser and checks it there. To do the same by hand:

**1. Read and test the code.** The same tests run on every commit in [GitHub Actions](https://github.com/minseochoj/nero/actions).

```bash
git clone https://github.com/minseochoj/nero && cd nero
cd solver && npm ci && npm test
cd ../site && npm ci && npm test && npx tsc --noEmit -p .
```

**2. Compare the commit the solver reports with this repository.**

```bash
curl -s https://www.neroswap.app/api/v2/info | jq .version
git log -1 --format=%H
```

**3. Check our Monero node against a public one.**

```bash
curl -s https://www.neroswap.app/api/node | jq
# ours.topBlockHash must equal reference.hashAtOurTop, and match any block explorer at height ours.height - 1
```

**4. Check a signed promise.** Paste it on the Verify page, or in Node:

```js
import nacl from 'tweetnacl'
import bs58 from 'bs58'
const deposit = bs58.decode('5GDP6viv4mK1XE2RBtdLoz3ct65YFjq6yfFoqXBi7bbk')
const ok = nacl.sign.detached.verify(new TextEncoder().encode(promiseText), bs58.decode(signature), deposit)
```

**5. Check your payment** in your own Monero wallet, with the tx hash, tx key and your address:

```
monero-wallet-cli> check_tx_key <tx hash> <tx key> <your address>
```

Feather and Monero GUI have the same check under *Advanced → Prove/check*.

## Public keys

| What | Value |
|---|---|
| Solver deposit wallet (Solana) | `5GDP6viv4mK1XE2RBtdLoz3ct65YFjq6yfFoqXBi7bbk` |
| Sealing key (X25519, base64) | `l0meX+p6q/5U+TC5qoqbTZLttsYxSrqy8EPjXZGyhTA=` |
| Standard exit fee owner (Solana) | `BGoyuZjKWwajN9U5q5xgFcPB5CER6vpYoL1fpCyzKvvv` |
| wXMR mint | `WXMRyRZhsa19ety5erZhHg4N3xj3EVN92u94422teJp` |
| wXMR bridge program | `EzBkC8P5wxab9kwrtV5hRdynHAfB5w3UPcPXNgMseVA8` |
| Jupiter v6 | `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4` |

If any of these ever change, it happens in a commit here first, and the site refuses to seal to a key the code does not name.

## Repository layout

```
site/                 Next.js 15 (App Router), deployed on Vercel
  app/                pages and API routes (/api/v2/* relays to the solver, /api/node, /api/stats, ...)
  components/         the swap panels, the Verify page, the order views
  lib/v2.ts           private exit: pinned keys, address sealing, memo, promise check, transaction check
  lib/server/exit.ts  standard exit: builds and simulates the one-transaction exit
  lib/bridge.ts       wXMR bridge client, from its on-chain IDL
  test/               unit tests (tsx --test)
solver/               Node 20+, no framework
  index.js            HTTP API on 127.0.0.1, the deposit watcher, payouts, refunds, signed promises, node status
  core.js             pure logic: sealing, memo format, pricing, the pay/refund/hold decision, promise text
  address.js          no-wallet orders on one-time deposit addresses (and cross-chain orders, switched off)
  rebalance.js        turns earned SOL back into XMR through the bridge, in batches
  xmr.js              monero-wallet-rpc client
  lib/                Solana helpers (safe send), Jupiter, the bridge, Monero address checks, the state store
  scripts/new-keys.mjs  makes a fresh set of solver keys
  test/               unit tests (node --test)
deploy/               systemd units for monerod and monero-wallet-rpc, a Caddy example, the deploy script
brand/                the logo
```

## Run it locally

```bash
# the site, against a solver you can reach (an SSH tunnel to your own is fine)
cd site
cp .env.example .env.local     # set SOLANA_RPC_URL and SOLVER_URL
npm ci
npm run dev                    # http://localhost:8811
```

Tests need nothing running:

```bash
cd solver && npm test          # 27 tests: sealing, memo, pricing, pay/refund decisions, address orders, promises
cd site && npm test            # sealing, the transaction check, links, help anchors, and more
```

## Run your own

You can run the whole thing yourself. You need a Linux server, a Solana RPC endpoint, and XMR for the float.

1. **Monero node.** Install the official `monerod` and run it with `deploy/monerod.service` (pruned, restricted RPC on 127.0.0.1). Let it sync.
2. **Wallet service.** `deploy/nero-wallet-rpc.service` runs `monero-wallet-rpc` on 127.0.0.1, against your own node only. Create a wallet with its `create_wallet` call and **back up the seed**.
3. **Keys.** `node solver/scripts/new-keys.mjs /opt/nero/keys` makes the deposit wallet, the fee owner and the secrets. It refuses to overwrite an existing directory.
4. **Config.** Copy `solver/.env.example` to `solver/.env`, append `/opt/nero/keys/secrets.env`, set the RPC and the wallet password.
5. **Start.** First start only: `SOLVER_INIT=1 node index.js` (it begins at the deposit wallet's newest transaction). After that, `node index.js` under pm2 or systemd. Quotes stay off until `SOLVER_ENABLED=1`.
6. **Pin your keys in the site.** Put your deposit wallet and sealing key in `site/lib/v2.ts` (the site never trusts a key it is sent), set `SOLVER_URL`, deploy.

## Money safety in the solver

The solver moves real money, so it is written to stop rather than guess:

- **Pays only against a finalized deposit.** XMR cannot be taken back, so a payout waits for Solana finality.
- **Booked before sent.** Every payout and refund is written to disk as in flight before it goes out. A crash mid-send leaves the order *stuck* for a person, never resent blindly.
- **Never retried on an unknown outcome.** Only errors that prove a transfer was not created (for example, not enough unlocked balance) lead to a refund. Anything ambiguous is held.
- **Refunds need proof too.** A refund is rebroadcast only if the first one provably never landed.
- **Refuses to start without its state.** A missing state file would re-handle every past deposit, so the solver exits unless told this is its first run.
- **Caps.** A minimum and maximum per order, a daily cap, and a reserve check before every quote. Quotes, payouts and rebalancing each have their own switch: `SOLVER_ENABLED`, `PAYOUTS_ENABLED`, `REBALANCE_LIVE`.
- **Independent prices.** A quote is refused if the pool price is more than 3% from two public price feeds.
- **Local only.** The HTTP API binds to 127.0.0.1 and is reached through a reverse proxy that blocks the admin path. The wallet RPC and the node's RPC are local only.

## Fees

| Route | Fee | Goes to |
|---|---|---|
| Private exit, wallet connected | 0.6%, inside the quote | The solver's reserve |
| Private exit, no wallet | 0.9%, inside the quote | The solver's reserve |
| Standard exit | 0.3% of the swap output, shown in the quote | Nero, for the node and the servers |
| wXMR bridge withdrawal | 0.1% | The bridge operator |

The XMR you are shown is the XMR you get.

## Security

Found a problem? Please read [SECURITY.md](SECURITY.md) and report it privately. Do not open a public issue for anything that could put funds at risk.

## License

[MIT](LICENSE). Nero is not affiliated with the Monero Project, Solana, Jupiter or the wXMR bridge. Nothing here is financial advice. Rules on privacy coins differ by country; you are responsible for what applies to you.
