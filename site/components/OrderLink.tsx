'use client'

import { useState } from 'react'
import { LINK_HOLDS, orderLink, type OrderKind } from '@/lib/orderLink'

/*
  Sits on a private order page: copies the link back to this order, and says in one line what the link holds and
  what anyone else would see with it (the empty form: the order and its proof live in this browser only).
*/
export default function OrderLink({ kind, id }: { kind: OrderKind; id: string }) {
  const [state, setState] = useState<'' | 'done' | 'failed'>('')
  let href = ''
  try { href = orderLink(window.location.origin, kind, id) } catch { return null }

  const copy = async () => {
    try { await navigator.clipboard.writeText(href); setState('done') } catch { setState('failed') }
    setTimeout(() => setState(''), 1800)
  }

  return (
    <p className="hint" style={{ margin: 0 }}>
      <button type="button" className="link" style={{ background: 'none', border: 0, borderBottom: '1px solid var(--line-2)', padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--text)' }} onClick={copy}>
        <span aria-live="polite">{state === 'done' ? 'Link copied' : state === 'failed' ? 'Could not copy: use the address bar' : 'Copy link to this order'}</span>
      </button>
      {' '}It holds {LINK_HOLDS[kind]} and nothing else. It reopens the order in this browser only: anyone else sees an empty form, with no Monero address and no proof.
    </p>
  )
}
