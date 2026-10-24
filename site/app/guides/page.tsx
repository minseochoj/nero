import Link from 'next/link'
import { GUIDES } from '@/lib/guides'
import { pageMeta } from '@/lib/meta'

export const metadata = pageMeta('Guides', 'Step-by-step guides to moving SOL, USDC, USDT, pump.fun coins and exchange withdrawals into real Monero with Nero, and to checking the payment proof yourself.', '/guides')

export default function Guides() {
  return (
    <div className="wrap guides">
      <p className="kicker">Guides</p>
      <h1 className="h-1">One exit, start to finish.</h1>
      <p className="lead">Each guide walks through one thing from start to finish: an exit to Monero with what it costs, how long it takes and what stays public, or checking afterwards that you were paid.</p>
      <div className="guides-list">
        {GUIDES.map((g) => (
          <Link key={g.slug} href={`/guides/${g.slug}`}>
            <b>{g.card.replace(/\.$/, '')}</b>
            <span>{g.description}</span>
            <i aria-hidden="true">→</i>
          </Link>
        ))}
      </div>
    </div>
  )
}
