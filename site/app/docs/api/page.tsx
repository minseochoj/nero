import Link from 'next/link'
import { pageMeta } from '@/lib/meta'
import { BRAND } from '@/lib/brand'
import { EXIT_TOKENS } from '@/lib/tokens'
import { swapLink } from '@/lib/swapLink'
import { EX } from '@/lib/apiExamples'

export const metadata = pageMeta('For integrators', 'Send your users to a prefilled Monero exit with one link, and read Nero’s public numbers and node state as JSON. No key, no sign-up.', '/docs/api')

const B = BRAND.url

const TOC = [
  ['link', 'Link to a prefilled exit'], ['read', 'Reading the numbers'], ['stats', 'Totals'], ['private', 'Private exit'],
  ['node', 'Our Monero node'], ['tokens', 'Token search'], ['not', 'What is not offered'],
]

function Get({ path, children }: { path: string; children: React.ReactNode }) {
  return (
    <>
      <p className="api-get"><span>GET</span><a href={path}>{path}</a></p>
      <p>{children}</p>
    </>
  )
}

const Code = ({ label, children }: { label: string; children: string }) => (
  <pre className="api-code" tabIndex={0} role="region" aria-label={label}>{children}</pre>
)

export default function ApiDocs() {
  const sol1 = swapLink(B, { token: 'SOL', amount: '1' })
  const usdc = swapLink(B, { token: 'USDC', amount: '250' })
  const big = swapLink(B, { tab: 'exit', token: 'SOL', amount: '30' })
  return (
    <div className="wrap doc">
      <nav className="doc-toc" aria-label="On this page">{TOC.map(([id, l]) => <a key={id} href={`#${id}`}>{l}</a>)}</nav>
      <article>
        <p className="kicker">For integrators</p>
        <h1>Link in, read out.</h1>
        <p>Two things other sites, wallets and bots can use today: a link that opens Nero with the token and amount already filled in, and the public numbers as JSON. There is no key and no sign-up. How the exits themselves work is in the <Link className="link" href="/docs">Paper</Link>.</p>

        <h2 id="link">Link to a prefilled exit</h2>
        <p>Send someone to the swap page with the token and amount set. They paste their own Monero address, check the quote and sign. Everything is optional; a bare <code>/swap</code> opens the private exit on SOL.</p>
        <Code label="Link format">{`${B}/swap?in=<token address>&amount=<amount>&tab=<tab>`}</Code>
        <table>
          <tbody>
            <tr><th><code>in</code></th><td>The token to exit from, as its Solana address. Understood today: {EXIT_TOKENS.map((t, i) => <span key={t.symbol}>{i ? ', ' : ''}{t.symbol} <code>{t.mint}</code></span>)}. Any other value is ignored and the page opens on SOL; every other token is one tap away in the page&apos;s own token list.</td></tr>
            <tr><th><code>amount</code></th><td>How much of that token, in whole units: <code>1</code>, <code>0.5</code>, <code>250</code>. Digits and at most one dot. Anything else is ignored.</td></tr>
            <tr><th><code>tab</code></th><td><code>private</code> (the default, paid by our solver), <code>exit</code> (the standard exit through the wXMR bridge, for larger amounts) or <code>enter</code> (Monero into Solana).</td></tr>
          </tbody>
        </table>
        <h3>Examples</h3>
        <Code label="Example links">{`${sol1}\n${usdc}\n${big}`}</Code>
        <p>Try them: <a className="link" href={sol1}>1 SOL</a>, <a className="link" href={usdc}>250 USDC</a>, <a className="link" href={big}>30 SOL on the standard exit</a>.</p>
        <p className="callout">There is no parameter for the Monero address, and there will not be one. A link must never be able to choose where someone&apos;s money goes, so the address is always typed or pasted by the person themselves. If a link claims to fill it in, it is not ours.</p>

        <h2 id="read">Reading the numbers</h2>
        <p>Every address below is a plain <code>GET</code> on <code>{B}</code> and answers in JSON. A few rules cover all of them:</p>
        <ul>
          <li><strong>Amounts are whole numbers sent as text</strong>, in the smallest unit. A field ending in <code>Pico</code> is XMR: divide by 1,000,000,000,000. SOL is in lamports: divide by 1,000,000,000.</li>
          <li><strong>Times are Unix seconds</strong>, UTC.</li>
          <li><strong>Errors</strong> come back as <code>{'{ "error": "…" }'}</code> with a 4xx or 5xx status. A 502 or 503 means that part is not answering right now; the <Link className="link" href="/status">status page</Link> shows the same thing.</li>
          <li><strong>Call from your server.</strong> Browsers on other sites are not allowed to read these addresses directly.</li>
          <li><strong>Ask at most twice a minute.</strong> The numbers do not move faster than that, and the totals are cached for about 20 seconds anyway.</li>
          <li>Fields may be added over time. Ignore the ones you do not know.</li>
        </ul>

        <h2 id="stats">Totals</h2>
        <Get path="/api/stats">Everything on the home page in one call: prices, the private exit&apos;s running totals and our Monero node. <code>solver.xmrPico</code> is all XMR paid on private exits so far, <code>solver.reservePico</code> is the XMR in the solver&apos;s wallet, and <code>node</code> is our node as the solver reads it.</Get>
        <Code label="Example answer from /api/stats">{EX.stats}</Code>

        <h2 id="private">Private exit</h2>
        <Get path="/api/v2/info">Whether the private exit is open, and its limits right now. <code>minPico</code> and <code>maxPico</code> are the smallest and largest single order, <code>availablePico</code> is the most it can pay this minute, <code>spreadBps</code> is the fee in hundredths of a percent (60 is 0.6%), and <code>quoteTtl</code> is how many seconds a wallet quote is held. Without a wallet connection the fee is <code>addrFeeBps</code> (90 is 0.9%) and the order is locked for <code>addrTtl</code> seconds (900 is 15 minutes).</Get>
        <Code label="Example answer from /api/v2/info">{EX.info}</Code>
        <Get path="/api/v2/estimate?amount=1000000000">What an amount of SOL gets in XMR on the no-wallet route, fees included. <code>amount</code> is in lamports, so this example asks about 1 SOL. <code>feeBps</code> is 90 (0.9%); a connected wallet pays 0.6% and gets slightly more. It is a price, not a reservation: nothing is held until someone creates an order on the swap page, and <code>ttl</code> is how many seconds that order would then be locked for.</Get>
        <Code label="Example answer from /api/v2/estimate">{EX.estimate}</Code>
        <Get path="/api/v2/stats">The <code>solver</code> part of the totals on its own, uncached. Private exits are published as running totals only, never per order and never per day, so no single exit can be picked out by its date and size.</Get>

        <h2 id="node">Our Monero node</h2>
        <Get path="/api/node">Our node&apos;s height and top block hash, and the same block as a public Monero node we do not run sees it. <code>reference.match</code> is true when both have the same block at that height, which means our node is on the real Monero chain. This is what the <Link className="link" href="/verify">Verify page</Link> shows.</Get>
        <Code label="Example answer from /api/node">{EX.node}</Code>

        <h2 id="tokens">Token search</h2>
        <Get path="/api/tokens?q=USDC">The lookup behind the swap page&apos;s token list: search by name or ticker, or pass a token address. Up to eight matches with name, ticker, decimals and icon. <code>verified</code> is the token list&apos;s own mark, not ours; tickers are not unique, so match on <code>mint</code>.</Get>
        <Code label="Example answer from /api/tokens">{EX.tokens}</Code>

        <h2 id="not">What is not offered</h2>
        <ul>
          <li><strong>No address that builds an exit for you.</strong> An exit is made on neroswap.app, where the page seals the Monero address in the person&apos;s own browser and checks the transaction before their wallet sees it. Handing that to another site would remove both checks, so use the link.</li>
          <li><strong>No per-order data for private exits.</strong> Totals only, on purpose.</li>
          <li><strong>No referral fee today.</strong> If that changes it will be written here first.</li>
        </ul>
        <p>Building something on top of this, or missing a number? Open an issue on <a className="link" href={BRAND.github} target="_blank" rel="noreferrer">GitHub</a>. The same facts in a form made for language models are at <a className="link" href="/llms.txt">/llms.txt</a>.</p>
      </article>
    </div>
  )
}
