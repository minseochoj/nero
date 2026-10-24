'use client'

import { useEffect, useState } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'
import type { ExitRecord } from './Exit'
import { short, xmr } from '@/lib/format'
import OrderAlert from './OrderAlert'
import { PROOF_GUIDE } from '@/lib/orderLink'

type St = {
  state: 'unknown' | 'pending' | 'sending' | 'completed' | 'reverted' | 'cancelled' | 'failed'
  amount?: string; fee?: string; xmrTxHash?: string; xmrTxKey?: string; xmrAddress?: string; reason?: string; solanaTx?: string; cancellable?: boolean
}

export default function Tracker({ rec, onCancel }: { rec: ExitRecord; onCancel?: () => Promise<void> | void }) {
  const { connection } = useConnection()
  const [st, setSt] = useState<St>({ state: 'unknown' })
  const [cancelling, setCancelling] = useState(false)
  const [loaded, setLoaded] = useState(false) // the status has been read at least once

  useEffect(() => {
    let dead = false
    let t: ReturnType<typeof setTimeout>
    const tick = async () => {
      try {
        const r = await fetch(`/api/exit/status?w=${rec.w}`)
        const j: St = await r.json()
        if (dead) return
        if (j.state === 'unknown' && rec.sig && Date.now() / 1000 - rec.at > 45) {
          const s = await connection.getSignatureStatuses([rec.sig]).catch(() => null)
          const v = s?.value?.[0]
          if (v?.err) { setSt({ state: 'failed' }); setLoaded(true); return }
        }
        if (r.ok) { setSt(j); setLoaded(true) }
        if (['completed', 'reverted', 'cancelled', 'failed'].includes(j.state)) return
      } catch {}
      if (!dead) t = setTimeout(tick, 3000)
    }
    tick()
    return () => { dead = true; clearTimeout(t) }
  }, [rec, connection])

  const s = st.state
  const order = ['unknown', 'pending', 'sending', 'completed']
  const at = order.indexOf(s)
  const cls = (i: number) => (s === 'completed' || at > i ? 'done' : at === i ? 'now' : '')
  const address = st.xmrAddress || rec.xmrAddress

  return (
    <div className="track">
      <div className="kicker" role="status">
        {s === 'completed' ? <span className="track-state ok">XMR sent</span>
          : s === 'reverted' || s === 'failed' ? <span className="track-state bad">{s === 'failed' ? 'Failed' : 'Reverted'}</span>
          : s === 'cancelled' ? <span className="track-state">Cancelled</span>
          : <span className="track-state">Sending to Monero…</span>}
        {rec.from && <span>{rec.from} → Monero</span>}
      </div>

      {s === 'failed' ? (
        <div className="note bad">The Solana transaction failed, so nothing moved. Your funds are still in your wallet.</div>
      ) : s === 'reverted' ? (
        <div className="note warn">The bridge reverted this request{st.reason ? `: ${st.reason}` : ''}. Your wXMR was returned to your wallet.</div>
      ) : s === 'cancelled' ? (
        <div className="note">Cancelled. The wXMR went back to your wallet. You can exit again or swap it back.</div>
      ) : (
        <div className="track-steps">
          <div className={cls(0)}>Confirmed on Solana<small>{rec.sig ? <a className="link" href={`https://solscan.io/tx/${rec.sig}`} target="_blank" rel="noreferrer">{short(rec.sig, 6)}</a> : 'Swap and bridge request in one transaction'}</small></div>
          <div className={cls(1)}>Bridge picked it up<small>Your wXMR is burned and the request is queued</small></div>
          <div className={cls(2)}>Sending XMR<small>The bridge signs a Monero transaction to your address</small></div>
          <div className={cls(3)}>XMR sent{st.amount && s === 'completed' ? <small className="num">{xmr(st.amount, 6)} XMR to {short(address, 8)}</small> : <small>Usually within a minute</small>}</div>
        </div>
      )}

      {s === 'completed' && st.xmrTxHash && (
        <div className="facts">
          <div><span>Monero tx</span><span className="proof"><a className="link" href={`https://xmrchain.net/tx/${st.xmrTxHash}`} target="_blank" rel="noreferrer">{short(st.xmrTxHash, 10)}</a></span></div>
          <div><span>Tx key (proof)</span><span className="proof"><button type="button" className="link" style={{ background: 'none', border: 0, borderBottom: '1px solid var(--line-2)', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit' }} onClick={() => navigator.clipboard?.writeText(st.xmrTxKey || '')}>{short(st.xmrTxKey || '', 10)} · copy</button></span></div>
        </div>
      )}
      {s === 'completed' && <p className="hint" style={{ margin: 0 }}>Monero wallets show incoming funds after 10 confirmations (about 20 minutes) before they are spendable. The tx key lets anyone, including you, check the payment with any Monero wallet or explorer (“check tx key”). <a className="link" href={PROOF_GUIDE} target="_blank" rel="noopener">How to check it yourself</a>.</p>}

      {st.cancellable && onCancel && (
        <div className="note warn">
          Still waiting after five minutes. You can cancel and get your wXMR back.{' '}
          <button className="btn btn-sm" disabled={cancelling} onClick={async () => { setCancelling(true); try { await onCancel() } finally { setCancelling(false) } }}>{cancelling ? 'Cancelling…' : 'Cancel request'}</button>
        </div>
      )}
      <OrderAlert known={loaded && s !== 'cancelled'} outcome={s === 'completed' ? 'paid' : s === 'reverted' ? 'refunded' : s === 'failed' ? 'failed' : null} />
      <p className="hint" style={{ margin: 0 }}>Tracking link: <a className="link mono" href={`/swap?w=${rec.w}`}>/swap?w={short(rec.w, 6)}</a></p>
    </div>
  )
}
