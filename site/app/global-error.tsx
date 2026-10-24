'use client'

import { useEffect } from 'react'
import NeroMark from '@/components/NeroMark'

const WAYS: [string, string, string][] = [
  ['/swap', 'Swap', 'Exit from Solana into Monero'],
  ['/verify', 'Verify', 'Check the code, the node and your payment yourself'],
  ['/status', 'Status', 'Whether each route is open right now'],
  ['/help', 'Help', 'Plain answers, refunds and payment proofs'],
]

// The root layout itself failed, so nothing it loads (stylesheet, fonts, nav) can be counted on:
// this page brings its own html, body and styles. Links are plain ones, so each loads the site afresh.
const CSS = `
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:#09090a;color:#f3f1ec;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit;text-decoration:none}
:focus-visible{outline:2px solid #f3f1ec;outline-offset:2px}
.ge{width:100%;max-width:1160px;margin:0 auto;padding:0 28px 96px}
.ge-brand{display:inline-flex;align-items:center;gap:10px;height:64px;font-size:16px;font-weight:500;letter-spacing:-.01em}
.ge-body{padding-top:clamp(64px,12vh,132px);display:flex;flex-direction:column;align-items:flex-start;gap:20px}
.ge-code{margin:0;font-family:ui-monospace,'SFMono-Regular',Menlo,monospace;font-size:13px;color:#ff6600}
.ge h1{font-size:clamp(32px,4.4vw,52px);line-height:1.04;letter-spacing:-.035em;font-weight:400;margin:0}
.ge-lead{font-size:clamp(16px,1.45vw,19px);color:#8e8d93;margin:0;max-width:600px}
.ge-cta{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px}
.ge-btn{display:inline-flex;align-items:center;justify-content:center;height:40px;padding:0 18px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:14px;font-weight:500;white-space:nowrap}
.ge-btn:hover{border-color:rgba(255,255,255,.28)}
.ge-btn.on{background:#f3f1ec;color:#0b0b0c;border-color:#f3f1ec}
.ge-btn.on:hover{background:#fff;border-color:#fff}
.ge-ways{width:100%;max-width:760px;margin-top:44px;border-top:1px solid rgba(255,255,255,.08)}
.ge-ways a{display:grid;grid-template-columns:120px 1fr auto;gap:16px;align-items:baseline;padding:17px 0;border-bottom:1px solid rgba(255,255,255,.08)}
.ge-ways b{font-weight:500}
.ge-ways span{color:#8e8d93}
.ge-ways i{font-style:normal;color:#807f86;transition:color .15s,transform .15s}
.ge-ways a:hover i,.ge-ways a:focus-visible i{color:#ff6600;transform:translateX(3px)}
@media (max-width:640px){.ge{padding:0 16px 72px}}
@media (max-width:560px){.ge-ways a{grid-template-columns:1fr auto;gap:2px 12px}.ge-ways span{grid-column:1;grid-row:2;font-size:13.5px}.ge-ways i{grid-row:1 / span 2;align-self:center}}
@media (prefers-reduced-motion:reduce){.ge-ways i{transition:none}}
`

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Something went wrong | Nero</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <meta name="theme-color" content="#09090a" />
        <style>{CSS}</style>
      </head>
      <body>
        <div className="ge">
          <a href="/" className="ge-brand" aria-label="Nero home"><NeroMark size={20} />Nero</a>
          <main className="ge-body">
            <p className="ge-code">{error.digest ? `Error ${error.digest}` : 'Error'}</p>
            <h1>The site failed to load.</h1>
            <p className="ge-lead">Something broke before the page could be shown. It is a display problem only: nothing leaves your wallet unless you approved it there, and an order that is already on Solana does not depend on this page staying open.</p>
            <div className="ge-cta">
              <button className="ge-btn on" onClick={reset}>Try again</button>
              <a href="/swap" className="ge-btn">Back to the swap</a>
            </div>
            <nav className="ge-ways" aria-label="Other pages">
              {WAYS.map(([href, label, text]) => (
                <a key={href} href={href}>
                  <b>{label}</b>
                  <span>{text}</span>
                  <i aria-hidden>→</i>
                </a>
              ))}
            </nav>
          </main>
        </div>
      </body>
    </html>
  )
}
