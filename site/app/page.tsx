import Link from 'next/link'
import { helpLink } from '@/lib/helpAnchors'
import HeroQuote from '@/components/HeroQuote'
import JsonLd from '@/components/JsonLd'
import { BRAND } from '@/lib/brand'
import { PLATFORM_FEE_BPS } from '@/lib/constants'
import { usd, xmr } from '@/lib/format'
import { getStats } from '@/lib/server/stats'
import { SOLVER_DEPOSIT } from '@/lib/v2'

export const revalidate = 60
export const metadata = { title: { absolute: `${BRAND.name} | Solana in. Monero out.` } }

const FAQ: [string, React.ReactNode][] = [
  ['Do I need a Monero wallet?', 'Yes, to receive. Any wallet works: Cake, Feather, Monero GUI, Stack. Paste its address (it starts with 4 or 8). A fresh subaddress for each exit is best.'],
  ['Do I have to connect a wallet?', 'No. The private exit can give you a one-time deposit address instead: send SOL to it from any wallet or straight from an exchange, and XMR arrives at your Monero address.'],
  ['Can I start from another chain?', <>Soon. Exits from Base, Ethereum, Arbitrum, Optimism, Polygon and Avalanche are built and switch on once the private exit has run for a while. <Link className="link" href={helpLink('other-chains')}>Help</Link> has the details.</>],
  ['What is the minimum?', '0.01 XMR on the private exit. The standard exit needs 0.1 XMR, a rule of the bridge it uses.'],
  ['What does it cost?', <>Every fee is already inside the quote: the XMR you are shown is what you get. The private exit takes 0.6% with a wallet and 0.9% without one. The standard exit takes {PLATFORM_FEE_BPS / 100}%, and the bridge it uses takes 0.1%. The <Link className="link" href="/docs#fees">Paper</Link> lists each fee and where it goes.</>],
  ['How long does it take?', 'The private exit pays seconds after your Solana transaction is final, about 15 seconds in. Your Monero wallet shows it right away and can spend it after 10 confirmations, about 20 minutes.'],
  ['Who sends the XMR?', 'On the private exit, Nero does: our solver pays from its own Monero wallet, through our own Monero node, and refunds your SOL automatically if it cannot. On the standard exit, the wXMR bridge (wxmr.io) sends it.'],
  ['Does Nero hold my money?', 'On the private exit, for a few seconds: your SOL reaches our solver, and it pays you XMR or refunds you. Order sizes are capped to keep that small, and every order comes with a promise signed by the deposit wallet. On the standard exit, never: your funds go from your wallet to the bridge in one transaction.'],
  ['Is it anonymous?', 'Not on the Solana side: anyone can see that your wallet sent funds to Nero, and how much. On the private exit your Monero address is sealed in your browser and never appears on Solana. What happens after the XMR lands is private, because Monero hides senders, receivers and amounts by default.'],
  ['How do I check that I was paid?', <>The order page gives you the Monero transaction and its key. Any Monero wallet can check them against your address, without trusting us. The <Link className="link" href="/guides/check-payment-proof">proof guide</Link> shows how.</>],
  ['Can I read the code?', <>Yes. The site and the solver are open source on <a className="link" href={BRAND.github} target="_blank" rel="noreferrer">GitHub</a>, and the <Link className="link" href="/verify">Verify page</Link> shows which commit is running right now.</>],
]

const LD = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', '@id': `${BRAND.url}/#org`, name: BRAND.name, url: BRAND.url, logo: `${BRAND.url}/icon-512.png`, sameAs: [BRAND.github, ...(BRAND.x ? [`https://x.com/${BRAND.x}`] : [])] },
    { '@type': 'WebSite', '@id': `${BRAND.url}/#site`, name: BRAND.name, url: BRAND.url, description: BRAND.description, publisher: { '@id': `${BRAND.url}/#org` } },
  ],
}

export default async function Home() {
  const s = await getStats()
  const n = s.node
  return (
    <>
      <JsonLd data={LD} />
      <section className="hero">
        <picture className="hero-bg" aria-hidden="true">
          <source media="(max-width: 760px)" srcSet="/img/hero-m.webp" />
          <source media="(max-width: 1400px)" srcSet="/img/hero-sm.webp" />
          <img src="/img/hero.webp" alt="" />
        </picture>
        <div className="wrap hero-in">
          <h1 className="h-hero">Solana in.<br />Monero out.</h1>
          <p className="lead">Any Solana token into real XMR at your own Monero wallet, in seconds. Paid from our own Monero node. Your Monero address never appears on Solana.</p>
          <HeroQuote />
        </div>
      </section>

      <div className="wrap">
        <div className="ticker">
          <div><span className="k">XMR</span><span className="v">{s.xmrUsd ? usd(s.xmrUsd) : '·'}</span></div>
          <div><span className="k">Exited privately</span><span className="v">{s.solver ? `${xmr(s.solver.xmrPico, 3)} XMR` : '·'}</span>{s.solver ? <span className="s">{s.solver.exits} {s.solver.exits === 1 ? 'exit' : 'exits'}</span> : null}</div>
          <div><span className="k">Solver reserve</span><span className="v">{s.solver?.reservePico ? `${xmr(s.solver.reservePico, 2)} XMR` : '·'}</span>{s.solver?.reservePico && s.xmrUsd ? <span className="s">{usd((Number(s.solver.reservePico) / 1e12) * s.xmrUsd)}</span> : null}</div>
          <div><span className="k">Our Monero node</span><span className="v num">{n ? `#${n.height.toLocaleString('en-US')}` : '·'}</span>{n ? <span className="s">{n.synchronized ? 'In sync' : `Catching up, ${(n.targetHeight - n.height).toLocaleString('en-US')} blocks to go`}</span> : null}</div>
        </div>
        <p className="faint" style={{ margin: '14px 0 0', fontSize: 13.5 }}>Read live from our solver and node. Check each number yourself on the <Link className="link" href="/verify">Verify page</Link>, or see what is open right now on the <Link className="link" href="/status">status page</Link>.</p>
      </div>

      <section className="wrap section" id="how">
        <div className="section-head">
          <h2 className="h-1">How it works</h2>
          <p className="lead">You send a Solana token. Our solver pays you real Monero from its own wallet. Your Monero address travels sealed.</p>
        </div>
        <div className="route" aria-hidden="true">
          <div className="route-node"><b>Your token</b><span>Any Solana token</span></div>
          <div className="route-line"><span>Sealed order</span></div>
          <div className="route-node"><b>Our solver</b><span>Its own Monero node</span></div>
          <div className="route-line"><span>Pays</span></div>
          <div className="route-node end"><b>XMR</b><span>Your Monero wallet</span></div>
        </div>
        <div className="steps">
          <div className="step"><span className="n">01</span><h3 className="h-3">Quote</h3><p>Pick any token and paste a Monero address. You see the exact XMR you get, fee included, and a signed promise for it, before anything moves.</p></div>
          <div className="step"><span className="n">02</span><h3 className="h-3">Sign once, or just send</h3><p>One signature in your wallet. Or skip the wallet: send SOL to a one-time address from anywhere, even an exchange.</p></div>
          <div className="step"><span className="n">03</span><h3 className="h-3">Receive and check</h3><p>The solver pays seconds after your deposit is final, through our own Monero node, and hands you the proof. If it can&apos;t pay, your funds come back.</p></div>
        </div>
        <p className="muted" style={{ marginTop: 22, maxWidth: 720 }}>Bigger than the solver can cover right now? The standard exit takes it: your token is swapped to wXMR and redeemed through the wXMR bridge in one transaction, with no size limit of ours.</p>
        <p className="muted" style={{ marginTop: 12, maxWidth: 720 }}>One exit walked through from start to finish: <Link className="link" href="/guides/sol-to-xmr">SOL to XMR</Link>, <Link className="link" href="/guides/usdc-to-xmr">USDC to XMR</Link>, <Link className="link" href="/guides/usdt-to-xmr">USDT to XMR</Link>, <Link className="link" href="/guides/pump-fun-to-xmr">a pump.fun coin to XMR</Link>, or <Link className="link" href="/guides/exchange-to-xmr">an exchange withdrawal with no wallet connected</Link>.</p>
      </section>

      <section className="wrap section">
        <div className="duo">
          <Link href="/swap" className="duo-item">
            <span className="duo-k">Solana to Monero</span>
            <h3 className="h-2">Exit to Monero</h3>
            <p>Any Solana token becomes real XMR at the address you choose. One signature, or no wallet connection at all. No account.</p>
            <span className="duo-a">Open the exit →</span>
          </Link>
          <Link href="/swap?tab=enter" className="duo-item">
            <span className="duo-k">Monero to Solana</span>
            <h3 className="h-2">Enter from Monero</h3>
            <p>Your wallet gets its own Monero deposit address on the bridge. Send XMR, receive wXMR, trade it anywhere on Solana.</p>
            <span className="duo-a">Get a deposit address →</span>
          </Link>
        </div>
      </section>

      <section className="wrap section">
        <div className="split">
          <div className="section-head" style={{ marginBottom: 0 }}>
            <h2 className="h-1">Public until it lands.</h2>
            <p className="lead">A Solana wallet is a public record. Monero is not. This is exactly where the line falls.</p>
          </div>
          <dl className="ledger">
            <div><dt>Still public</dt><dd>That your Solana wallet sent funds to Nero, and how much. On the standard exit, also the Monero address you exit to.</dd></div>
            <div><dt>Private after</dt><dd>Once XMR is in your wallet, Monero hides who sends, who receives and how much, for everyone, by default.</dd></div>
            <div><dt>Your address</dt><dd>On the private exit it is sealed in your browser with our solver&apos;s key. On Solana it is unreadable.</dd></div>
            <div><dt>Our own node</dt><dd>The solver&apos;s wallet reads the Monero chain and sends every payment through a node we run, so no outside node sees which transactions are ours.</dd></div>
            <div><dt>Who you trust</dt><dd>Our solver, for the seconds between your deposit and its payout (or the bridge operator, on the standard exit). Use a fresh subaddress each time.</dd></div>
          </dl>
        </div>
      </section>

      <section className="band">
        <picture className="band-bg" aria-hidden="true">
          <source media="(max-width: 760px)" srcSet="/img/band-m.webp" />
          <source media="(max-width: 1400px)" srcSet="/img/band-sm.webp" />
          <img src="/img/band.webp" alt="" />
        </picture>
        <div className="wrap band-in">
          <h2 className="h-1">Check every step.</h2>
          <p className="lead">Nero is built so you can verify it yourself, from the code to the payment in your wallet.</p>
          <dl className="band-facts">
            <div><dt>Open source</dt><dd>The site and the solver are public on GitHub, and both say which commit they run</dd></div>
            <div><dt>Own Monero node</dt><dd>Its height and sync state are read live, on the Verify page</dd></div>
            <div><dt>Signed promise</dt><dd>Every order comes with a promise signed by the public deposit wallet</dd></div>
            <div><dt>Payment proof</dt><dd>Every payout gives you its transaction key, checkable in any Monero wallet</dd></div>
          </dl>
          <div className="band-cta">
            <Link href="/verify" className="btn btn-primary">Verify Nero</Link>
            <a href={BRAND.github} className="btn" target="_blank" rel="noreferrer">Read the code</a>
            <span className="mono faint" style={{ fontSize: 12.5 }}>Deposit wallet {SOLVER_DEPOSIT.toBase58()}</span>
          </div>
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head"><h2 className="h-1">Questions</h2></div>
        <div className="faq">
          {FAQ.map(([q, a]) => (
            <details key={q}><summary>{q}</summary><div className="ans">{a}</div></details>
          ))}
        </div>
        <div className="cta-band">
          <div>
            <h2 className="h-2">Start with a quote.</h2>
            <p className="muted" style={{ margin: '6px 0 0' }}>Quotes are free. Nothing moves until you sign.</p>
          </div>
          <Link href="/swap" className="btn btn-primary btn-lg">Open app</Link>
        </div>
      </section>
    </>
  )
}
