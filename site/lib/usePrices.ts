'use client'

import { useEffect, useState } from 'react'
import { SOL_MINT } from './constants'

/*
  Dollar prices for the swap forms, shown next to the amounts as a rough guide only. Quotes never use them.
  XMR and SOL come from /api/stats; any other token from the token lookup. Refreshed once a minute.
*/
export function usePrices(mint: string): { xmr: number; tok: number } {
  const [base, setBase] = useState<{ xmr: number; sol: number }>({ xmr: 0, sol: 0 })
  const [other, setOther] = useState<{ mint: string; usd: number } | null>(null)
  const sol = SOL_MINT.toBase58()

  useEffect(() => {
    let dead = false
    const load = async () => {
      try {
        const s = await (await fetch('/api/stats')).json()
        if (!dead) setBase({ xmr: Number(s.xmrUsd) > 0 ? Number(s.xmrUsd) : 0, sol: Number(s.solUsd) > 0 ? Number(s.solUsd) : 0 })
      } catch {}
    }
    load()
    const t = setInterval(load, 60_000)
    return () => { dead = true; clearInterval(t) }
  }, [])

  useEffect(() => {
    if (mint === sol) return
    let dead = false
    const load = async () => {
      try {
        const list: { mint: string; usdPrice?: number }[] = await (await fetch(`/api/tokens?mints=${mint}`)).json()
        const p = Array.isArray(list) ? list.find((t) => t.mint === mint)?.usdPrice : undefined
        if (!dead) setOther({ mint, usd: typeof p === 'number' && p > 0 ? p : 0 })
      } catch {}
    }
    load()
    const t = setInterval(load, 60_000)
    return () => { dead = true; clearInterval(t) }
  }, [mint, sol])

  return { xmr: base.xmr, tok: mint === sol ? base.sol : other?.mint === mint ? other.usd : 0 }
}
