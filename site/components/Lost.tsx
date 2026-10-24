import Link from 'next/link'

const WAYS: [string, string, string][] = [
  ['/swap', 'Swap', 'Exit from Solana into Monero'],
  ['/verify', 'Verify', 'Check the code, the node and your payment yourself'],
  ['/status', 'Status', 'Whether each route is open right now'],
  ['/help', 'Help', 'Plain answers, refunds and payment proofs'],
]

// Shared body of the not-found and error pages: one line of what happened, then the ways back.
export default function Lost({ code, title, children, action }: { code: string; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="wrap lost">
      <p className="kicker mono">{code}</p>
      <h1 className="h-1">{title}</h1>
      <p className="lead">{children}</p>
      <div className="lost-cta">
        {action}
        <Link href="/swap" className={`btn ${action ? '' : 'btn-primary'}`}>Back to the swap</Link>
      </div>
      <nav className="lost-ways" aria-label="Other pages">
        {WAYS.map(([href, label, text]) => (
          <Link key={href} href={href}>
            <b>{label}</b>
            <span>{text}</span>
            <i aria-hidden>→</i>
          </Link>
        ))}
      </nav>
    </div>
  )
}
