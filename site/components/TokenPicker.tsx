'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { EXIT_TOKENS, SOL_MINT, TOKEN_PROGRAM } from '@/lib/constants'
import { fromRaw } from '@/lib/format'
import { listTarget } from '@/lib/a11y'
import { loadLastToken, pickerRows, type LastToken } from '@/lib/lastToken'

const TOKEN_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')
type Held = Tok & { bal: string; usd: number }
const money = (n: number) => (n >= 1 ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : n >= 0.01 ? `$${n.toFixed(2)}` : '')

export type Tok = { symbol: string; mint: string; decimals: number; icon?: string; name?: string; verified?: boolean }

/* Pick any Solana token: the three common ones, a search by name or ticker, or a pasted mint. */
export default function TokenPicker({ value, onChange }: { value: Tok; onChange: (t: Tok) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Tok[]>([])
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [hi, setHi] = useState(0) // the row the arrow keys are on
  const id = useId()
  const seq = useRef(0)
  const { publicKey } = useWallet()
  const { connection } = useConnection()
  const [mine, setMine] = useState<Held[]>([])
  const cache = useRef<{ key: string; at: number }>({ key: '', at: 0 })
  const [last, setLast] = useState<LastToken | null>(null)
  // the token of the last exit made in this browser, read each time the list opens
  useEffect(() => { if (open) setLast(loadLastToken()) }, [open])

  // what the connected wallet holds, most valuable first (read when the list opens, kept for 30 seconds)
  useEffect(() => {
    if (!publicKey) { setMine([]); cache.current = { key: '', at: 0 }; return }
    const key = publicKey.toBase58()
    if (!open || (cache.current.key === key && Date.now() - cache.current.at < 30_000)) return
    let dead = false
    ;(async () => {
      try {
        const [lamports, ...accts] = await Promise.all([
          connection.getBalance(publicKey),
          ...[TOKEN_PROGRAM, TOKEN_2022].map((programId) => connection.getParsedTokenAccountsByOwner(publicKey, { programId }).then((r) => r.value).catch(() => [])),
        ])
        const bal = new Map<string, bigint>()
        for (const a of accts.flat()) {
          const i = a.account.data.parsed.info
          const amt = BigInt(i.tokenAmount.amount)
          if (amt > 0n && i.tokenAmount.decimals > 0) bal.set(i.mint, (bal.get(i.mint) || 0n) + amt)
        }
        const sol = SOL_MINT.toBase58()
        const meta: (Tok & { usdPrice?: number })[] = await (await fetch(`/api/tokens?mints=${[sol, ...bal.keys()].slice(0, 60).join(',')}`)).json()
        if (dead || !Array.isArray(meta)) return
        const rows: Held[] = []
        for (const t of meta) {
          const raw = t.mint === sol ? BigInt(lamports) : bal.get(t.mint)
          if (!raw || raw <= 0n) continue
          const short = EXIT_TOKENS.find((e) => e.mint === t.mint)
          rows.push({ ...t, symbol: short?.symbol || t.symbol, icon: short?.icon || t.icon, bal: fromRaw(raw, t.decimals, 4), usd: (Number(raw) / 10 ** t.decimals) * (t.usdPrice || 0) })
        }
        setMine(rows.sort((a, b) => b.usd - a.usd).slice(0, 12))
        cache.current = { key, at: Date.now() }
      } catch {}
    })()
    return () => { dead = true }
  }, [open, publicKey, connection])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => {
    const s = q.trim()
    if (s.length < 2) { setFound([]); setBusy(false); return }
    const id = ++seq.current
    setBusy(true)
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/tokens?q=${encodeURIComponent(s)}`)
        const j = r.ok ? await r.json() : []
        if (id === seq.current) setFound(Array.isArray(j) ? j : [])
      } catch { if (id === seq.current) setFound([]) }
      finally { if (id === seq.current) setBusy(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  // closing from the keyboard puts focus back on the button that opened the list
  const shut = (refocus: boolean) => { setOpen(false); setQ(''); if (refocus) trigger.current?.focus() }
  const pick = (t: Tok) => { onChange({ symbol: t.symbol, mint: t.mint, decimals: t.decimals, icon: t.icon, name: t.name, verified: t.verified }); shut(true) }
  const searching = q.trim().length >= 2
  const rows: { t: Tok & Partial<Held>; head?: string }[] = searching ? found.map((t) => ({ t })) : pickerRows<Tok & Partial<Held>>(last, mine, EXIT_TOKENS)
  const list = rows.map((r) => r.t)
  useEffect(() => { setHi(0) }, [q, open])
  const at = Math.min(hi, list.length - 1)
  // focus stays in the search box: the arrows move a highlight through the rows, Enter takes it, Escape closes
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); shut(true); return }
    if (e.key === 'Enter') { if (list[at] && !busy) { e.preventDefault(); pick(list[at]) } return } // not while a search is still running: the rows are the last search's
    if ((e.key === 'Home' || e.key === 'End') && q) return // those move the caret while there is text
    const n = listTarget(e.key, at, list.length)
    if (n < 0) return
    e.preventDefault()
    setHi(n)
    document.getElementById(`${id}-${n}`)?.scrollIntoView({ block: 'nearest' })
  }
  // some logo hosts refuse cross-site loads: retry once through an image proxy, then fall back to the first letter
  const Icon = ({ t }: { t: Tok }) => (
    <span className="dot">{t.icon ? <img src={t.icon} alt="" referrerPolicy="no-referrer" onError={(e) => {
      const el = e.target as HTMLImageElement
      if (!el.dataset.proxied && !t.icon!.startsWith('/')) { el.dataset.proxied = '1'; el.src = `https://wsrv.nl/?url=${encodeURIComponent(t.icon!)}&w=64&h=64&fit=cover` }
      else el.style.display = 'none'
    }} /> : t.symbol.slice(0, 1)}</span>
  )

  return (
    <div className="rel" ref={box} onBlur={(e) => { if (open && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) shut(false) }}>
      <button ref={trigger} type="button" className="asset" onClick={() => (open ? shut(false) : setOpen(true))} aria-haspopup="dialog" aria-expanded={open} aria-label={`Token to send: ${value.symbol}. Change token`}>
        <Icon t={value} />{value.symbol}<span className="faint" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="asset-menu" role="dialog" aria-label="Choose a token" onKeyDown={keys}>
          <input autoFocus placeholder="Search a token or paste its address" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search a token or paste its address" role="combobox" aria-expanded aria-autocomplete="list" aria-controls={`${id}-list`} aria-activedescendant={list[at] ? `${id}-${at}` : undefined} autoComplete="off" spellCheck={false} />
          {/* a press on a row must not take focus out of the search box */}
          <div role="listbox" id={`${id}-list`} aria-label="Tokens" onMouseDown={(e) => e.preventDefault()}>
          {rows.map(({ t, head }, i) => (
            <div key={t.mint} role="presentation" style={{ display: 'contents' }}>
            {head && <div role="presentation" className="faint" style={{ fontSize: 11.5, padding: i ? '8px 10px 2px' : '6px 10px 2px' }}>{head}</div>}
            <button type="button" role="option" id={`${id}-${i}`} tabIndex={-1} aria-selected={t.mint === value.mint} className={i === at ? 'hi' : undefined} onMouseEnter={() => setHi(i)} onClick={() => pick(t)}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Icon t={t} />
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                  <span>{t.symbol}</span>
                  {t.name && <span className="faint" style={{ fontSize: 11.5, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>}
                </span>
              </span>
              {t.bal !== undefined
                ? <span className="num" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: 13 }}><span>{t.bal}</span>{money(t.usd || 0) && <span className="faint" style={{ fontSize: 11.5 }}>{money(t.usd || 0)}</span>}</span>
                : <span className="faint mono" style={{ fontSize: 11 }}>{t.mint.slice(0, 4)}…{t.mint.slice(-4)}</span>}
            </button>
            </div>
          ))}
          </div>
          <div role="status">
          {searching && !busy && !found.length && <div className="hint" style={{ padding: '10px 12px' }}>No token found. Paste the full token address.</div>}
          {busy && <div className="hint" style={{ padding: '10px 12px' }}>Searching…</div>}
          </div>
        </div>
      )}
    </div>
  )
}
