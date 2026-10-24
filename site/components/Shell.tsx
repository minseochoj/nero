'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import NeroMark from './NeroMark'
import { BRAND } from '@/lib/brand'

const LINKS = [
  { href: '/swap', label: 'Swap' },
  { href: '/verify', label: 'Verify' },
  { href: '/docs', label: 'Paper' },
  { href: '/help', label: 'Help' },
]

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const on = (h: string) => (path === h || path.startsWith(`${h}/`) ? 'on' : '')
  const here = (h: string) => (on(h) ? 'page' as const : undefined)
  const inApp = path.startsWith('/swap')
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="nav">
        <div className="wrap nav-in">
          <Link href="/" className="logo"><NeroMark size={22} />{BRAND.name}</Link>
          <nav className="nav-links" aria-label="Main">
            {LINKS.map((l) => <Link key={l.href} href={l.href} className={on(l.href)} aria-current={here(l.href)}>{l.label}</Link>)}
          </nav>
          <div className="nav-right">{inApp ? <div id="nav-wallet" style={{ minHeight: 32, minWidth: 128, display: 'flex', justifyContent: 'flex-end' }} /> : <Link href="/swap" className="btn btn-primary btn-sm">Open app</Link>}</div>
        </div>
        <nav className="mnav" aria-label="Main"><div className="wrap mnav-in">{LINKS.map((l) => <Link key={l.href} href={l.href} className={on(l.href)} aria-current={here(l.href)}>{l.label}</Link>)}</div></nav>
      </header>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer className="foot">
        <nav className="wrap foot-in" aria-label="Footer">
          <span className="logo" style={{ fontSize: 14 }}><NeroMark size={16} />{BRAND.name}</span>
          <Link href="/swap">Swap</Link>
          <Link href="/verify">Verify</Link>
          <Link href="/docs">Paper</Link>
          <Link href="/help">Help</Link>
          <Link href="/guides">Guides</Link>
          <Link href="/status">Status</Link>
          <Link href="/docs/api">API</Link>
          <Link href="/what-is-public">What is public</Link>
          <a href={BRAND.github} target="_blank" rel="noreferrer">GitHub ↗</a>
          <a href="https://wxmr.io" target="_blank" rel="noreferrer">wXMR bridge ↗</a>
          {BRAND.x && <a href={`https://x.com/${BRAND.x}`} target="_blank" rel="noreferrer">X ↗</a>}
          <p className="foot-note">Nero never signs for you. On the private exit our solver holds your deposit for the seconds before it pays you XMR, and refunds it if it cannot. The standard exit runs through the wXMR bridge, a third party that holds the XMR backing wXMR. Your Solana side is public. Nothing here is financial advice. Site build <a className="link" href={BRAND.commit === 'dev' ? BRAND.github : `${BRAND.github}/commit/${BRAND.commit}`} target="_blank" rel="noreferrer"><span className="mono">{BRAND.commit.slice(0, 7)}</span></a>.</p>
        </nav>
      </footer>
    </>
  )
}
