import { pageMeta } from '@/lib/meta'
import { BRIDGE_AUTHORITY, BRIDGE_PROGRAM, PLATFORM_FEE_BPS, WXMR_MINT } from '@/lib/constants'
import { BRAND } from '@/lib/brand'
import { SOLVER_BOX_PUB, SOLVER_DEPOSIT } from '@/lib/v2'

export const metadata = pageMeta('Paper', 'How Nero works, how to verify it, what you trust, and where the limits are.', '/docs')

function T({ s }: { s: 'live' | 'built' | 'next' }) {
  return <span className="status">{s === 'live' ? 'running today' : s === 'built' ? 'built, switched off' : 'planned'}</span>
}

const TOC = [
  ['summary', 'Summary'], ['problem', 'The problem'], ['private', 'Private exit'], ['exit', 'Standard exit'], ['enter', 'Enter from Monero'],
  ['bridge', 'The wXMR bridge'], ['verify', 'Verify it yourself'], ['fees', 'Fees'], ['privacy', 'Privacy, precisely'], ['trust', 'Who you trust'],
  ['risks', 'Risks'], ['next', 'What comes next'], ['addresses', 'Addresses'],
]

const boxPub = btoa(String.fromCharCode(...SOLVER_BOX_PUB))

export default function Paper() {
  return (
    <div className="wrap doc">
      <nav className="doc-toc">{TOC.map(([id, l]) => <a key={id} href={`#${id}`}>{l}</a>)}</nav>
      <article>
        <p className="kicker">Nero paper · v1.0 · October 2026</p>
        <h1>Solana in. Monero out.</h1>
        <p>Nero turns any Solana token into real XMR at your own Monero address, in one transaction you sign yourself, or with no wallet connection at all. It runs its own Monero node and its own solver, and its code is public. This paper says what runs, what you trust at each step, how to check each claim yourself, and where the limits are. Where this page and the chain disagree, the chain wins.</p>

        <h2 id="summary">01 · Summary</h2>
        <ul>
          <li><strong>Private exit</strong> <T s="live" />: the default. Send any Solana token; Nero&apos;s solver pays you real XMR from its own Monero wallet, through its own Monero node. Your Monero address is sealed in your browser and never appears on Solana.</li>
          <li><strong>Standard exit</strong> <T s="live" />: for amounts larger than the solver can cover. Swap any token with a route into wXMR and burn that wXMR with the bridge, addressed to your Monero wallet, all in one Solana transaction.</li>
          <li><strong>Enter from Monero</strong> <T s="live" />: open a deposit account on the bridge, get your own Monero subaddress, and receive wXMR on Solana for the XMR you send.</li>
          <li><strong>Open source</strong> <T s="live" />: the site and the solver are on <a href={BRAND.github} target="_blank" rel="noreferrer">GitHub</a>. Both report the commit they run, and every order and payout comes with something you can check without us.</li>
        </ul>

        <h2 id="problem">02 · The problem</h2>
        <p>Every balance and payment on Solana is public forever. One labelled address ties a wallet&apos;s whole history to a person. Monero was built the other way round: ring signatures hide the sender among decoys, one-time stealth addresses hide the receiver, and RingCT hides the amount, for every transaction, by default.</p>
        <p>The gap is getting from one to the other. Privacy-coin delistings left few clean ramps, and most cross-chain routes end in a wrapped token that is just as public as what you started with. Nero&apos;s answer is narrow on purpose: one signature on Solana, real XMR at the end.</p>

        <h2 id="private">03 · Private exit <T s="live" /></h2>
        <p>The standard exit names your Monero address on Solana, inside the bridge request. The private exit does not. Nero runs its own Monero node and its own solver, which pays real XMR from its own Monero wallet. The wallet reads the chain and sends payments through our node only, so no outside node sees which transactions are ours.</p>
        <ul>
          <li><strong>The order.</strong> One transaction you sign: SOL (or a Jupiter swap into SOL) to the solver&apos;s deposit wallet, and a memo carrying your Monero address sealed in your browser with the solver&apos;s public key (X25519, NaCl box). Only the solver can open it. On Solana it is unreadable. The deposit wallet and the sealing key are pinned in the site&apos;s code, not fetched.</li>
          <li><strong>The quote.</strong> Bound to your wallet, valid for 60 seconds, with the fee built in. You get exactly the quoted XMR. Each quote is cross-checked against two independent price feeds before it is offered.</li>
          <li><strong>The promise.</strong> Before you sign, the solver signs a short text with the deposit wallet&apos;s own key: what you send, what you get, until when, and where a refund goes. Anyone can check that signature against the public deposit wallet. See <a href="#verify">section 07</a>.</li>
          <li><strong>Pay or refund.</strong> The solver pays from its own wallet once the deposit is final on Solana, about 15 seconds after you send. If anything does not match (late, short, unreadable address, not enough XMR on hand), your SOL is refunded automatically, minus the network fee. Each payout and refund is booked before it is sent and never retried blindly; anything unclear is held for a person.</li>
          <li><strong>The proof.</strong> The Monero tx hash and tx key are shown only to the browser holding the order secret, whose hash is in the memo. With them, any Monero wallet can confirm that your address received the amount.</li>
          <li><strong>Refills.</strong> The solver turns the SOL it earns back into XMR in batches through the wXMR bridge, so refills cannot be matched to any one exit.</li>
          <li><strong>Without a wallet connection.</strong> The same exit with a one-time Solana deposit address per order: send SOL from any wallet or exchange. The quote is locked for 15 minutes; the fee is 0.9% for the longer lock. A Solana refund address is required, because the sender of an exchange withdrawal is not you. Short or late deposits go back to it; overpayments are paid and the extra returned.</li>
          <li><strong>From another chain</strong> <T s="built" />: the same exit, started from Base, Ethereum, Arbitrum, Optimism, Polygon or Avalanche, or from USDC and USDT on Solana. You send to a one-time address on that chain; a cross-chain route delivers SOL to a one-time Solana address of our solver; the solver pays your XMR. The route never sees your Monero address. It opens once the private exit has run for a while.</li>
          <li><strong>Limits.</strong> 0.01 XMR minimum and 0.5 XMR maximum per order to start, with a daily cap. What one order can be right now is shown live on the swap page and the <a href="/status">status page</a>.</li>
        </ul>

        <h2 id="exit">04 · Standard exit <T s="live" /></h2>
        <p>This is the route through the wXMR bridge. It has no size limit of ours, and it names your Monero address on Solana. Nero builds one versioned transaction with these steps, in order:</p>
        <ul>
          <li>Compute budget, then Jupiter&apos;s setup, swap and cleanup instructions, routing your token into wXMR.</li>
          <li>The bridge&apos;s <code>request_withdrawal(nonce, amount, xmr_address, exact_out = false)</code>, where <code>amount</code> is the swap&apos;s guaranteed minimum output.</li>
        </ul>
        <p>Because the withdrawal asks for the slippage floor, it can never ask for more wXMR than the swap is guaranteed to deliver. Anything above the floor stays in your wallet as wXMR. If any step fails, the whole transaction fails and nothing moves.</p>
        <p>Before your wallet is asked to sign, the server simulates the full transaction against mainnet, and the page checks that the fee payer is your wallet, that only the expected programs appear (compute budget, system, token, associated token, Jupiter, the bridge), and that the Monero address inside the bridge instruction is the one you typed.</p>
        <h3>Limits and timing</h3>
        <ul>
          <li>Minimum: 0.1 XMR, enforced by the bridge program.</li>
          <li>The bridge relayer marks the request as sending, pays out on Monero, then records the Monero tx hash and tx key on Solana, usually within a minute.</li>
          <li>Monero wallets need 10 confirmations (about 20 minutes) before received funds are spendable.</li>
          <li>If a request is still pending after five minutes, its owner can cancel it and the wXMR is returned. The tracking page offers this when it applies.</li>
        </ul>

        <h2 id="enter">05 · Enter from Monero <T s="live" /></h2>
        <p>Your wallet signs <code>create_deposit_account</code>, which costs a small amount of SOL as account rent. The bridge relayer then assigns that account a Monero subaddress. XMR sent to it (0.1 XMR minimum per deposit) is minted as wXMR to your wallet after Monero confirmations, with no bridge fee. If your wallet had no wXMR account at the time, the minted wXMR waits in the deposit&apos;s holding account until you claim it, and the page shows a button for that.</p>
        <p>The subaddress is recorded on Solana next to your wallet. That reveals that this wallet receives from Monero, not where the XMR came from.</p>

        <h2 id="bridge">06 · The wXMR bridge</h2>
        <p>Nero does not run the bridge. It is wxmr.io, an independent Monero to Solana bridge with an open-source frontend. Facts read from chain:</p>
        <table>
          <tbody>
            <tr><th>wXMR mint</th><td><code>{WXMR_MINT.toBase58()}</code>, 12 decimals, no freeze authority</td></tr>
            <tr><th>Bridge program</th><td><code>{BRIDGE_PROGRAM.toBase58()}</code> (upgradeable)</td></tr>
            <tr><th>Operator key</th><td><code>{BRIDGE_AUTHORITY.toBase58()}</code>: the program&apos;s upgrade authority and the relayer that mints, sends and completes</td></tr>
            <tr><th>Fee</th><td>0.1% on withdrawals, 0% on deposits (the operator can change it)</td></tr>
            <tr><th>Reserves</th><td>The bridge publishes view-key based reserve proofs and on-chain audit records at wxmr.io</td></tr>
          </tbody>
        </table>
        <div className="callout">wXMR is a custodial wrap. One operator holds the XMR behind it and one key can upgrade the program. Nero reduces how long you hold wXMR to a single transaction, but it cannot remove that trust. The private exit uses the bridge only for its own refills, never for your payout.</div>

        <h2 id="verify">07 · Verify it yourself</h2>
        <p>Nero is not trustless: on the private exit you trust our solver for the seconds between your deposit and its payout. What we can do is make every claim checkable, so that trust is small, short and visible. Each item below can be checked without asking us. The <a href="/verify">Verify page</a> does most of it live, in your browser.</p>
        <ul>
          <li><strong>The code.</strong> The site and the solver are public on <a href={BRAND.github} target="_blank" rel="noreferrer">GitHub</a>. The site&apos;s footer names the commit it was built from, and the solver reports the commit it runs at <code>/api/v2/info</code>.</li>
          <li><strong>The keys.</strong> The deposit wallet and the sealing key the site uses are written in its source (<code>site/lib/v2.ts</code>) and in this paper. Your browser seals your address to that key; nothing is fetched at order time that could swap it.</li>
          <li><strong>Our Monero node.</strong> Its height, the hash of its top block and whether it is in sync are read live at <code>/api/v2/node</code>. Compare them with any public Monero explorer.</li>
          <li><strong>The promise.</strong> Every order comes with a text signed by the deposit wallet&apos;s ed25519 key. The Verify page checks one in your browser; any ed25519 library can too. It names the amounts and a hash of the sealed address, never the address itself, so it is safe to show anyone.</li>
          <li><strong>The payment.</strong> The tx hash and tx key of your payout prove, in any Monero wallet (<code>check_tx_key</code>, or Feather and Monero GUI&apos;s payment check), that your address received the amount. The <a href="/guides/check-payment-proof">proof guide</a> walks through it.</li>
          <li><strong>The Solana side.</strong> Every deposit to the solver and every refund is a public transaction to or from the deposit wallet, which anyone can list in an explorer.</li>
        </ul>
        <p>What cannot be proven from outside: that the server runs exactly the published code, and how much XMR the solver holds. We publish the reserve as a number, not as a proof, on purpose: a Monero reserve proof reveals key images, which would mark our payout transactions on the Monero chain and weaken your privacy after the exit. Per-order limits keep what you trust us with small instead.</p>

        <h2 id="fees">08 · Fees</h2>
        <table>
          <thead><tr><th>Fee</th><th>Rate</th><th>Goes to</th></tr></thead>
          <tbody>
            <tr><td>Private exit</td><td>0.6% with a wallet, 0.9% without one, built into the quote</td><td>The solver&apos;s reserve, which sets how much it can pay per order</td></tr>
            <tr><td>Private exit from another chain</td><td>0.9%, plus the route&apos;s own cost, all inside the amount you are shown</td><td>Our part to the solver&apos;s reserve; the rest to the route and the networks</td></tr>
            <tr><td>Standard exit</td><td>{PLATFORM_FEE_BPS / 100}% of the swap output, in wXMR, shown in the quote</td><td>Nero, for the node and the servers</td></tr>
            <tr><td>Bridge withdrawal (standard exit)</td><td>0.1%</td><td>The wXMR bridge operator</td></tr>
            <tr><td>Network</td><td>Solana fees and Jupiter routing</td><td>Validators and liquidity pools</td></tr>
          </tbody>
        </table>

        <h2 id="privacy">09 · Privacy, precisely</h2>
        <table>
          <tbody>
            <tr><th>Public, private exit</th><td>That your Solana wallet sent funds to Nero, and how much. Your Monero address, the Monero transaction and its tx key are not on Solana.</td></tr>
            <tr><th>Public, standard exit</th><td>Your Solana wallet, what you swapped and how much, the Monero address you exit to, and the bridge&apos;s Monero tx hash and tx key. With the tx key anyone can confirm that address received that amount.</td></tr>
            <tr><th>Known to Nero</th><td>On the private exit, the solver opens your sealed Monero address to pay it, so it knows which Solana wallet paid which Monero address. It keeps that in its own records and publishes none of it.</td></tr>
            <tr><th>Private</th><td>What happens to the XMR afterwards. Monero hides the sender, receiver and amount of every later transaction.</td></tr>
            <tr><th>Never shared</th><td>Your keys. Your wallet signs every transaction itself. Nero keeps no accounts.</td></tr>
          </tbody>
        </table>
        <p>The same facts route by route, the no-wallet and other-asset orders included, are on <a href="/what-is-public">What is public</a>.</p>
        <p>Good practice: exit to a fresh subaddress each time, avoid round numbers and instant re-use, and once the XMR lands, send it on to another of your own addresses before using it.</p>

        <h2 id="trust">10 · Who you trust</h2>
        <table>
          <thead><tr><th>Party</th><th>For what</th></tr></thead>
          <tbody>
            <tr><td>Nero&apos;s solver</td><td>Private exit: paying the quoted XMR seconds after your deposit is final, or refunding it. Per-order and daily limits keep what it holds at any moment small, and its signed promise makes a broken one provable.</td></tr>
            <tr><td>The cross-chain route (NEAR Intents)</td><td>Exits from another chain only: taking your deposit on that chain and delivering SOL to our solver, or returning it to your refund address there. It never sees your Monero address.</td></tr>
            <tr><td>The wXMR bridge</td><td>Standard exit: holding the XMR behind wXMR, sending your XMR after the burn, and not abusing its upgrade key.</td></tr>
            <tr><td>Jupiter and the pools it routes through</td><td>The swap leg, bounded by your slippage limit.</td></tr>
            <tr><td>Nero&apos;s website</td><td>Building a correct transaction. The page checks it before your wallet signs, and your wallet shows it to you.</td></tr>
          </tbody>
        </table>

        <h2 id="risks">11 · Risks</h2>
        <ul>
          <li>The solver&apos;s wallets are online keys on a server. If that server were compromised, its reserve and any deposit in flight could be lost. Limits per order and per day bound this.</li>
          <li>A private-exit refund is sent by the solver, not enforced by a program yet. If the solver were offline, a refund would wait until it is back.</li>
          <li>An exit from another chain passes through a third-party route first. If that route failed or was slow, your funds would be with it, not with us, and its refund goes to the address you gave on your own chain.</li>
          <li>Bridge failure, theft or shutdown would leave wXMR unbacked. Standard exits in flight could be lost. The bridge program can be upgraded by its operator at any time.</li>
          <li>Thin wXMR liquidity means price impact on large exits. The quote shows it before you sign.</li>
          <li>A wrong Monero address cannot be recovered. Nero validates the checksum and keys, but cannot know whether the address is yours.</li>
          <li>Rules on privacy coins differ by country, and some services refuse funds that touched Monero. You are responsible for what applies to you.</li>
        </ul>

        <h2 id="next">12 · What comes next <T s="next" /></h2>
        <ul>
          <li><strong>A dedicated server.</strong> The solver, its wallets and our Monero node on their own locked-down machine, with nothing else beside them.</li>
          <li><strong>A refund program on Solana.</strong> Deposits held by a program that returns them after a timeout, so a private-exit refund no longer depends on the solver.</li>
          <li><strong>Reproducible deploys.</strong> A signed build record for every deploy, so the running code can be matched to a commit by more than our word.</li>
          <li><strong>Higher private-exit limits</strong> as the reserve grows.</li>
        </ul>

        <h2 id="addresses">13 · Addresses</h2>
        <table>
          <tbody>
            <tr><th>Solver deposit</th><td><code>{SOLVER_DEPOSIT.toBase58()}</code></td></tr>
            <tr><th>Sealing key (X25519)</th><td><code>{boxPub}</code></td></tr>
            <tr><th>wXMR</th><td><code>{WXMR_MINT.toBase58()}</code></td></tr>
            <tr><th>Bridge program</th><td><code>{BRIDGE_PROGRAM.toBase58()}</code></td></tr>
            <tr><th>Jupiter v6</th><td><code>JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4</code></td></tr>
            <tr><th>Source code</th><td><a href={BRAND.github} target="_blank" rel="noreferrer">{BRAND.github.replace('https://', '')}</a></td></tr>
          </tbody>
        </table>
        <p>Building on Nero? The link format for a prefilled exit and the public numbers, each with an example answer, are on the <a href="/docs/api">page for integrators</a>.</p>
      </article>
    </div>
  )
}
