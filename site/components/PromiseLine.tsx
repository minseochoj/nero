'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { OrderPromise } from '@/lib/v2'

/*
  Under an order: the promise the solver signed for it, already checked by this page before anything was signed.
  Copying gives the text and its signature in one block, which the Verify page splits again. Unlike the payment
  proof, a promise holds no Monero address (only a hash of the sealed one), so it is safe to show anyone.
*/
export default function PromiseLine({ p }: { p: OrderPromise }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${p.text}\nsignature: ${p.signature}`); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch {}
  }
  return (
    <details className="hint" style={{ margin: 0 }}>
      <summary style={{ cursor: 'pointer' }}>Signed promise for this order <span style={{ color: 'var(--ok)' }}>✓ checked</span></summary>
      <pre className="mono" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12, margin: '10px 0', color: 'var(--muted)' }}>{p.text}{'\n'}signature: {p.signature}</pre>
      <button type="button" className="btn btn-sm" onClick={copy}>{copied ? 'Copied' : 'Copy promise'}</button>{' '}
      <Link className="link" href="/verify" style={{ fontSize: 13 }}>Check it on the Verify page</Link>
    </details>
  )
}
