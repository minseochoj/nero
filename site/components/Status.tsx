'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ago, xmr } from '@/lib/format'

/*
  Every line here is read from the same public endpoints the app itself uses, from your browser, every 30 seconds.
  Nothing is hard-coded as "fine": a line that cannot be read says so.
*/
type Row = { name: string; ok: boolean | null; text: React.ReactNode }
const get = async (url: string) => { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(String(r.status)); return r.json() }
async function read(): Promise<Row[]> {
  const [info, est, std, stats, nd] = await Promise.allSettled([
    get('/api/v2/info'),
    get('/api/v2/estimate?amount=1000000000'),
    get('/api/exit/quote?in=So11111111111111111111111111111111111111112&amount=1000000000'),
    get('/api/stats'),
    get('/api/v2/node'),
  ])
  const v = <T,>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : null) as any
  const i = v(info), e = v(est), s = v(std), st = v(stats), n = v(nd)
  const rows: Row[] = []

  rows.push(!i ? { name: 'Private exit', ok: false, text: 'Not answering. The standard exit does not depend on it.' }
    : !i.enabled ? { name: 'Private exit', ok: false, text: 'Paused. Use the standard exit meanwhile.' }
    : { name: 'Private exit', ok: !!e?.xmrOut, text: e?.xmrOut
        ? <>Open. 1 SOL pays about <span className="num">{xmr(e.xmrOut, 4)} XMR</span> right now. Orders from {xmr(i.minPico, 2)} to {xmr(i.maxPico, 2)} XMR{i.availablePico !== null && <>, <span className="num">{xmr(i.availablePico, 3)} XMR</span> ready for the next one</>}.</>
        : 'Open, but a price could not be read just now.' })
  rows.push({ name: 'No-wallet deposits', ok: i ? !!i.enabled : false, text: !i ? 'Not answering.' : i.enabled ? 'Open. One-time deposit addresses are being issued.' : 'Paused with the private exit.' })
  rows.push({ name: 'Standard exit', ok: !!s?.ok, text: s?.ok ? 'Open. The route through the wXMR bridge is quoting.' : 'No route right now. Try again in a minute.' })

  const sv = st?.solver
  rows.push({ name: 'Solver reserve', ok: sv ? BigInt(sv.reservePico || '0') >= BigInt(i?.minPico || '0') : null, text: sv?.reservePico
    ? <><span className="num">{xmr(sv.reservePico, 3)} XMR</span> in the solver&apos;s own Monero wallet. {sv.exits} private exits paid{sv.lastPaidAt ? <>, the last one {ago(sv.lastPaidAt)}</> : ''}; {sv.refunds} refunded.</>
    : 'Could not be read.' })

  rows.push(!n ? { name: 'Our Monero node', ok: false, text: 'Not answering. Payouts wait until it is back; nothing is lost.' }
    : { name: 'Our Monero node', ok: !!n.synchronized, text: n.synchronized
        ? <>In sync at block <span className="num">{n.height.toLocaleString('en-US')}</span>. The solver&apos;s wallet is at <span className="num">{n.walletHeight ? n.walletHeight.toLocaleString('en-US') : '·'}</span>.</>
        : <>Catching up: block <span className="num">{n.height.toLocaleString('en-US')}</span> of <span className="num">{n.targetHeight.toLocaleString('en-US')}</span>. The private exit waits until it is in sync.</> })

  rows.push({ name: 'Prices', ok: st ? st.xmrUsd > 0 && st.solUsd > 0 : false, text: st?.xmrUsd > 0
    ? <>XMR <span className="num">${Math.round(st.xmrUsd).toLocaleString('en-US')}</span> · SOL <span className="num">${st.solUsd.toFixed(2)}</span>. Every private quote is checked against an independent price before it is offered.</>
    : 'Could not be read.' })
  return rows
}

export default function Status() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [at, setAt] = useState(0)
  const [now, setNow] = useState(0)

  useEffect(() => {
    let dead = false
    const load = async () => { try { const r = await read(); if (!dead) { setRows(r); setAt(Date.now()) } } catch {} }
    load()
    const a = setInterval(load, 30_000), b = setInterval(() => setNow(Date.now()), 1000)
    return () => { dead = true; clearInterval(a); clearInterval(b) }
  }, [])

  const bad = rows?.filter((r) => r.ok === false) || []
  const secs = at && now ? Math.max(0, Math.round((now - at) / 1000)) : 0
  return (
    <>
      <div className="page-head">
        <h1 className="h-1">{!rows ? 'Checking…' : bad.length ? `${bad.length === 1 ? 'One thing needs' : `${bad.length} things need`} attention.` : 'Everything is working.'}</h1>
        <p className="lead">
          Read live from the same endpoints the app uses, straight from your browser. {rows ? <span className="num">Checked {secs < 2 ? 'just now' : `${secs} s ago`}.</span> : ''}
        </p>
      </div>
      <dl className="ledger" style={{ marginTop: 28 }}>
        {(rows || []).map((r) => (
          <div key={r.name}>
            <dt>{r.name}</dt>
            <dd style={r.ok === false ? { color: 'var(--bad)' } : undefined}>{r.text}</dd>
          </div>
        ))}
      </dl>
      <p className="muted" style={{ marginTop: 28, maxWidth: 640, fontSize: 14 }}>
        If something here looks wrong and stays wrong, your funds are not at risk from waiting: an order that cannot be paid is refunded, and anything unclear is held for a person to check. See <Link className="link" href="/help">Help</Link>.
      </p>
    </>
  )
}
