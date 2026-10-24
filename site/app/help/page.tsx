import { pageMeta } from '@/lib/meta'
import Link from 'next/link'
import { isValidElement } from 'react'
import JsonLd from '@/components/JsonLd'
import { BRAND } from '@/lib/brand'
import { PLATFORM_FEE_BPS } from '@/lib/constants'
import type { HelpAnchor } from '@/lib/helpAnchors'
import { PUBLIC_PATH } from '@/lib/whatIsPublic'

export const metadata = pageMeta('Help', 'Plain answers about Nero: which exit to use, timing, refunds, payment proofs and how to check Nero yourself.', '/help')

// Each answer has a fixed name from lib/helpAnchors.ts; it is the link to that answer (/help#cost).
const QA: [HelpAnchor, string, React.ReactNode][] = [
  ['which-exit', 'Which exit should I use?', <>Start with the <b>Private exit</b>: our solver pays you from its own Monero wallet, and your Monero address never appears on Solana. If an order is larger than it can cover, the page offers the <b>Standard exit</b>, which goes through the wXMR bridge and has no such limit.</>],
  ['what-is-public', 'What can other people see about my exit?', <>On Solana, always that your wallet sent funds, when, and how much. On the private exit your Monero address is not there; on the standard exit it is, together with a key that proves the payment. Nothing after the XMR lands is visible. <Link className="link" href={PUBLIC_PATH}>What is public</Link> sets it out route by route.</>],
  ['cost', 'What does it cost?', <>Every fee is already inside the quote: the XMR you are shown is what you get. The private exit takes 0.6% with a wallet and 0.9% without one. From another chain or from USDC or USDT without a wallet it is 0.9% plus the route&apos;s own cost, also inside the amount shown. The standard exit takes {PLATFORM_FEE_BPS / 100}%, and the bridge it uses takes 0.1%. The <Link className="link" href="/docs#fees">Paper</Link> lists each fee and where it goes.</>],
  ['stablecoins-no-wallet', 'Can I send USDC or USDT instead of SOL, without connecting a wallet?', <>Not yet. It is built and switches on soon, in the Private exit under <b>Other assets</b>. Until then, connect a wallet: the private exit takes any Solana token with one signature, USDC and USDT included.</>],
  ['other-chains', 'Can I start from another chain?', <>Soon. Exits from Base, Ethereum, Arbitrum, Optimism, Polygon and Avalanche are built and switch on once the private exit has run for a while. They will appear in the Private exit under <b>Other assets</b>, and the <Link className="link" href="/status">status page</Link> will say when.</>],
  ['late-deposit', 'My deposit from another chain was late, or the order says the rate changed.', <>If your deposit reaches us after the timer, there is no Solana address to send it back to, so it is paid at the rate of the moment it arrived and the order page says so. If you sent after the timer ended on your own chain, the route returns it to the refund address you gave there. If the page says "Being checked by hand", nothing is lost: keep the link and message us.</>],
  ['no-wallet', 'I don\'t want to connect a wallet.', <>In the Private exit, choose <b>Send SOL</b> (marked “No connection”). You get a one-time deposit address and send SOL to it from any wallet or exchange. Give a Solana refund address you control, because the sender of an exchange withdrawal is not you.</>],
  ['how-long', 'How long does it take?', <>The private exit waits for your Solana deposit to be final (about 15 seconds) and then pays, usually within seconds. The standard exit is usually under a minute. Your Monero wallet shows the payment right away and can spend it after 10 confirmations, about 20 minutes.</>],
  ['refunded', 'My order says "Refunded".', <>We could not pay it as quoted (the quote expired before your transaction landed, the amount was short, or there was not enough XMR on hand), so your SOL went back, minus the network fee. Private exits refund to the wallet that sent the order; no-connect orders refund to the refund address you gave.</>],
  ['wrong-amount', 'I sent the wrong amount to a deposit address.', <>Less than the amount, or anything after the timer: it is sent back to your refund address once the timer ends. More than the amount: the order is paid and the extra is sent back. Do not send a second payment to fix a first one.</>],
  ['checked-by-hand', 'My order says "Being checked by hand".', <>Something could not be confirmed automatically, so nothing more is sent until a person checks it. Nothing is lost. Send the Solana transaction link (or the deposit address) to <a className="link" href={`https://x.com/${BRAND.x}`} target="_blank" rel="noreferrer">@{BRAND.x}</a>.</>],
  ['no-order', 'I sent SOL to Nero without an order.', <>It is held, not lost, and it is not refunded automatically because we cannot know who it belongs to. Message <a className="link" href={`https://x.com/${BRAND.x}`} target="_blank" rel="noreferrer">@{BRAND.x}</a> with the transaction link.</>],
  ['proof', 'Where is my proof of payment?', <>The order page shows the Monero transaction and its tx key, only in the browser that created the order. Keep the page link. In a Monero wallet, the tx key proves the payment to your address.</>],
  ['check-proof', 'How do I check the proof myself?', <>Usually you do not need to: your Monero wallet shows the incoming payment within a minute or two. To check it independently, open the Monero GUI wallet, go to Advanced, then Prove/check, and under Check transaction enter the transaction ID, your address and the tx key from your order page. A block explorer can check it too, but then that explorer learns your address. The <Link className="link" href="/guides/check-payment-proof">proof guide</Link> has every step, the command line included.</>],
  ['down', 'Is something down?', <>The <Link className="link" href="/status">status page</Link> reads the live state of each route: whether exits are open, the current price, the solver&apos;s reserve and our Monero node.</>],
  ['wallet-warning', 'My wallet shows a warning.', <>A "new domain" notice is normal for a new site and clears with time. On the standard exit, wallets may flag wXMR as sharing a name with Monero: that is the bridge token, and the private exit does not use it. If you see anything else, stop and ask.</>],
  ['monero-wallet', 'I need a Monero wallet.', <>Cake Wallet (phone) and Feather Wallet (desktop) are widely used. Create a wallet, write down the recovery phrase, and copy a receive address. A fresh subaddress (starts with 8) for each exit is best.</>],
  ['verify', 'How can I check Nero myself?', <>Four ways, none of which need our word. The code of the site and the solver is public on <a className="link" href={BRAND.github} target="_blank" rel="noreferrer">GitHub</a>, and the <Link className="link" href="/verify">Verify page</Link> shows which commit runs right now. The same page reads our Monero node live. Every order comes with a promise signed by the public deposit wallet, which you can check there. And every payout comes with its Monero transaction key, which any Monero wallet checks against your address.</>],
  ['dm', 'Will Nero ever DM me?', <>No. We never message first, never ask for a recovery phrase or private key, and there is no support form that asks you to connect a wallet.</>],
]

// The answers as plain text, for the search-engine copy of this page.
function text(n: React.ReactNode): string {
  if (n == null || typeof n === 'boolean') return ''
  if (Array.isArray(n)) return n.map(text).join('')
  if (isValidElement<{ children?: React.ReactNode }>(n)) return text(n.props.children)
  return String(n)
}

const LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: QA.map(([, q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: text(a) } })),
}

export default function Help() {
  return (
    <div className="wrap doc">
      <JsonLd data={LD} />
      <nav className="doc-toc">{QA.map(([id, q]) => <a key={id} href={`#${id}`}>{q}</a>)}</nav>
      <article>
        <p className="kicker">Help</p>
        <h1>When something is unclear.</h1>
        <p>Short answers to what people ask most. For how everything works underneath, read the <Link className="link" href="/docs">Paper</Link>. For one exit walked through from start to finish, see the <Link className="link" href="/guides">guides</Link>.</p>
        {QA.map(([id, q, a]) => (
          <section key={id}>
            <h2 id={id}>{q}</h2>
            <p>{a}</p>
          </section>
        ))}
      </article>
    </div>
  )
}
