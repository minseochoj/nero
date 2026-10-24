'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EXIT_TOKENS } from '@/lib/tokens'
import { toRaw, xmr } from '@/lib/format'
import { rowKeys } from '@/lib/a11y'

/** The front door: type an amount, see the XMR, continue into the app with it filled in. */
export default function HeroQuote() {
  const router = useRouter()
  const [amount, setAmount] = useState('1')
  const [tok, setTok] = useState<(typeof EXIT_TOKENS)[number]>(EXIT_TOKENS[0])
  const [out, setOut] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const seq = useRef(0)
  // smallest order in pico-XMR: 0.01 on the private exit while it is open, else the bridge's 0.1
  const [minPico, setMinPico] = useState(100_000_000_000n)
  const raw = useMemo(() => toRaw(amount, tok.decimals), [amount, tok])

  useEffect(() => {
    fetch('/api/v2/info').then((r) => r.json()).then((j) => { if (j?.enabled && j.minPico) setMinPico(BigInt(j.minPico)) }).catch(() => {})
  }, [])

  useEffect(() => {
    setNote('')
    if (!raw || raw <= 0n) { setOut(null); return }
    const id = ++seq.current
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/exit/quote?in=${tok.mint}&amount=${raw}`)
        const j = await r.json()
        if (id !== seq.current) return
        if (!r.ok) { setOut(null); setNote(j.error || ''); return }
        setOut(j.xmrOut)
        if (BigInt(j.xmrOut) < minPico) setNote(`Minimum is ${xmr(minPico.toString(), 2)} XMR`)
      } catch { if (id === seq.current) setOut(null) }
    }, 350)
    return () => clearTimeout(t)
  }, [raw, tok, minPico])

  const go = () => router.push(`/swap?in=${tok.mint}&amount=${encodeURIComponent(amount)}`)

  return (
    <div className="hq">
      <div className="hq-row">
        <label className="hq-in">
          <span>You send</span>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} onKeyDown={(e) => e.key === 'Enter' && go()} aria-label="Amount to send" />
        </label>
        <div className="hq-tok" role="radiogroup" aria-label="Token" onKeyDown={rowKeys(EXIT_TOKENS, tok, setTok, 'radio')}>
          {EXIT_TOKENS.map((t) => (
            <button key={t.mint} type="button" role="radio" aria-checked={tok.mint === t.mint} tabIndex={tok.mint === t.mint ? 0 : -1} className={tok.mint === t.mint ? 'on' : ''} onClick={() => setTok(t)}>{t.symbol}</button>
          ))}
        </div>
        <div className="hq-out">
          <span>You get</span>
          <b className="num" aria-live="polite">{out ? xmr(out, 4) : <span aria-hidden="true">—</span>} <i>XMR</i></b>
        </div>
        <button className="btn btn-primary btn-lg hq-go" onClick={go}>Continue</button>
      </div>
      <p className="hq-note">{note || 'Real XMR at your own Monero address. Nothing moves until you sign.'}</p>
    </div>
  )
}
