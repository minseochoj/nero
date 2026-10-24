'use client'

import { useEffect, useRef, useState } from 'react'
import { ALERT, canOffer, shouldNotify, tabTitle, type Outcome } from '@/lib/orderAlert'

/*
  Sits on an order page. When the order ends, the tab title says so, and a notification is shown if the tab is in the
  background and the user asked for one. Permission is never requested on its own: only from the button below, which
  only exists while an order is in progress.

  known   = the order's status has been read at least once
  outcome = null while in progress
*/
export default function OrderAlert({ known, outcome }: { known: boolean; outcome: Outcome | null }) {
  const [perm, setPerm] = useState('unsupported')
  const base = useRef('')
  const sawPending = useRef(false)
  const told = useRef(false)

  useEffect(() => {
    base.current = document.title
    // Android browsers only allow notifications from a service worker, which this site does not have
    try { if ('Notification' in window && !/Android/i.test(navigator.userAgent)) setPerm(Notification.permission) } catch {}
    return () => { document.title = base.current }
  }, [])

  useEffect(() => {
    if (!known) return
    if (!outcome) { sawPending.current = true; told.current = false; document.title = base.current; return }
    document.title = tabTitle(base.current, outcome)
    if (!shouldNotify({ sawPending: sawPending.current, outcome, hidden: document.hidden, permission: perm, already: told.current })) return
    told.current = true
    try {
      const n = new Notification(ALERT[outcome].head, { body: ALERT[outcome].body, icon: '/icon-192.png', tag: 'nero-order' })
      n.onclick = () => { window.focus(); n.close() }
    } catch {}
  }, [known, outcome, perm])

  const ask = async () => {
    try { setPerm(await Notification.requestPermission()) } catch { setPerm('denied') }
  }

  if (canOffer({ known, outcome, supported: perm !== 'unsupported', permission: perm })) {
    return (
      <p className="hint" style={{ margin: 0 }}>
        Leaving this tab?{' '}
        <button className="link" style={{ background: 'none', border: 0, borderBottom: '1px solid var(--line-2)', padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--text)' }} onClick={ask}>Get a notification when it is done</button>
      </p>
    )
  }
  if (known && !outcome && perm === 'granted') return <p className="hint" style={{ margin: 0 }}>This browser will notify you when it is done. You can switch tabs.</p>
  return null
}
