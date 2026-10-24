'use client'

import { useEffect, useState } from 'react'
import { xmr } from '@/lib/format'

/*
  This browser's past exits, from localStorage only (nothing is fetched or stored on a server): private exits,
  no-wallet orders and standard exits, newest first, each linking back to its own order page with its proof.
*/
type Row = { key: string; at: number; kind: string; from: string; xmrPico: string; href: string }

function load(): Row[] {
  const read = (k: string): any[] => { try { return JSON.parse(localStorage.getItem(k) || '[]') } catch { return [] } }
  const rows: Row[] = []
  for (const o of read('nero.v2orders')) rows.push({ key: o.sig, at: o.at, kind: 'Private', from: o.from, xmrPico: o.xmrOut, href: `/swap?tab=private&o=${o.sig}` })
  for (const d of read('nero.v2deposits')) rows.push({ key: d.address, at: d.at, kind: 'No wallet', from: `${(Number(d.lamports) / 1e9).toString()} SOL`, xmrPico: d.xmrOut, href: `/swap?tab=private&d=${d.address}` })
  for (const x of read('nero.xorders')) rows.push({ key: x.address, at: x.at, kind: 'Other chain', from: `${x.symbol} on ${x.chainName}`, xmrPico: x.xmrOut, href: `/swap?tab=private&x=${x.address}` })
  for (const e of read('nero.exits')) if (e.w) rows.push({ key: e.w, at: e.at, kind: 'Standard', from: e.from, xmrPico: e.xmrOutMin, href: `/swap?tab=exit&w=${e.w}` })
  return rows.filter((r) => r.at > 0).sort((a, b) => b.at - a.at).slice(0, 8)
}

const when = (at: number) => {
  const m = Math.max(0, Math.round((Date.now() / 1000 - at) / 60))
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

export default function History() {
  const [rows, setRows] = useState<Row[]>([])
  useEffect(() => {
    setRows(load())
    const t = setInterval(() => setRows(load()), 5000) // a new order appears without a reload
    return () => clearInterval(t)
  }, [])
  if (!rows.length) return null
  return (
    <div style={{ marginTop: 18 }}>
      <div className="field-top" style={{ padding: '0 4px 8px' }}><span>Your recent exits</span><span className="faint">Kept in this browser only</span></div>
      <div className="facts">
        {rows.map((r, i) => (
          <a key={r.key} href={r.href} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '10px 0', fontSize: 13, color: 'inherit', textDecoration: 'none', borderTop: i ? '1px solid var(--line)' : 0 }}>
            <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{r.kind} · {when(r.at)}</span>
            <span style={{ textAlign: 'right' }}>{r.from} → {xmr(r.xmrPico, 4)} XMR</span>
          </a>
        ))}
      </div>
    </div>
  )
}
