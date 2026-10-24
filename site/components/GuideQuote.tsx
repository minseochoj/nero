'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { EXIT_TOKENS } from '@/lib/tokens'
import { xmr } from '@/lib/format'

const [, USDC, USDT] = EXIT_TOKENS

// What each guide quotes, from the same public endpoints the swap page uses.
const KINDS = {
  sol: { send: '1 SOL', url: '/api/v2/estimate?amount=1000000000', note: 'Fees included, sent from any wallet. A connected wallet gets slightly more.' },
  usdc: { send: '100 USDC', url: `/api/exit/quote?in=${USDC.mint}&amount=100000000`, note: 'Fees included, on the standard exit. The swap page gives your exact quote.' },
  usdt: { send: '100 USDT', url: `/api/exit/quote?in=${USDT.mint}&amount=100000000`, note: 'Fees included, on the standard exit. The swap page gives your exact quote.' },
  pump: { send: '1 SOL', url: '/api/v2/estimate?amount=1000000000', note: 'A coin is sold to SOL on the way. This is what 1 SOL gets, fees included; your coin’s own quote is on the swap page.' },
} as const

/** The live line on a guide: what a round amount gets right now, and the way into the swap page. */
export default function GuideQuote({ kind, href, label }: { kind: keyof typeof KINDS; href: string; label: string }) {
  const k = KINDS[kind]
  const [out, setOut] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let dead = false
    const load = async () => {
      if (document.hidden) return
      try {
        const r = await fetch(k.url)
        const j = await r.json()
        if (dead) return
        if (r.ok && j.xmrOut) { setOut(j.xmrOut); setFailed(false) } else setFailed(true)
      } catch { if (!dead) setFailed(true) }
    }
    load()
    const t = setInterval(load, 30_000)
    return () => { dead = true; clearInterval(t) }
  }, [k.url])

  return (
    <div className="gq">
      <div className="gq-main">
        <span className="gq-k">Right now</span>
        <p className="gq-line num" aria-live="polite">
          {k.send} <span className="gq-arrow" aria-hidden="true">→</span><span className="sr-only">gets about</span> <b>{out ? xmr(out, 4) : <span aria-hidden="true">—</span>}</b> <i>XMR</i>
        </p>
        <span className="gq-note">{failed && !out ? 'No quote right now. The swap page will show it.' : k.note}</span>
      </div>
      <Link href={href} className="btn btn-primary btn-lg">{label}</Link>
    </div>
  )
}
