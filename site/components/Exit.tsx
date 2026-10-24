'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js'
import ConnectButton from './ConnectButton'
import Tracker from './Tracker'
import TokenPicker, { type Tok } from './TokenPicker'
import { EXIT_TOKENS, PLATFORM_FEE_BPS, SOL_MINT } from '@/lib/constants'
import { verifyExit } from '@/lib/verifyExit'
import { checkMoneroAddress } from '@/lib/monero'
import { approxUsd, fromRaw, toRaw, xmr } from '@/lib/format'
import { usePrices } from '@/lib/usePrices'
import { loadLastToken, mayUseRemembered, saveLastToken } from '@/lib/lastToken'

type Quote = {
  inAmount: string; outAmount: string; minOut: string; platformFee: string; bridgeFeeBps: number
  xmrOut: string; xmrOutMin: string; priceImpactPct: number; route: string[]; ok: boolean; reason?: string
}
export type ExitRecord = { w: string; nonce: string; xmrAddress: string; sig: string; at: number; xmrOutMin: string; from: string }

const STORE = 'nero.exits'
export function loadExits(): ExitRecord[] {
  try { return JSON.parse(localStorage.getItem(STORE) || '[]') } catch { return [] }
}
function saveExit(e: ExitRecord) {
  try { localStorage.setItem(STORE, JSON.stringify([e, ...loadExits().filter((x) => x.w !== e.w)].slice(0, 20))) } catch {}
}

export default function Exit({ initial }: { initial?: { tok?: Tok; amount?: string; addr?: string } }) {
  const { connection } = useConnection()
  const { publicKey, sendTransaction, connected } = useWallet()
  const [tok, setTok] = useState<Tok>(initial?.tok || EXIT_TOKENS[0])
  const [amount, setAmount] = useState(initial?.amount || '')
  const [addr, setAddr] = useState(initial?.addr || '')
  const [bal, setBal] = useState<bigint | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [qErr, setQErr] = useState('')
  const [quoting, setQuoting] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [active, setActive] = useState<ExitRecord | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const pre = EXIT_TOKENS.find((t) => t.mint === p.get('in'))
    if (pre) setTok(pre)
    // no token or amount in the link, and nothing handed over from the private exit: start from the last token used here
    else if (!initial?.tok && mayUseRemembered(window.location.search)) { const last = loadLastToken(); if (last) setTok(last) }
    const amt = p.get('amount')
    if (amt && /^\d*\.?\d*$/.test(amt)) setAmount(amt)
    const w = p.get('w')
    if (w) {
      const known = loadExits().find((e) => e.w === w)
      setActive(known || { w, nonce: '', xmrAddress: '', sig: '', at: 0, xmrOutMin: '0', from: '' })
    }
  }, [])

  const raw = useMemo(() => toRaw(amount, tok.decimals), [amount, tok])
  const px = usePrices(tok.mint)
  const sendUsd = raw && raw > 0n ? approxUsd((Number(raw) / 10 ** tok.decimals) * px.tok) : ''
  const gotUsd = quote ? approxUsd((Number(quote.xmrOut) / 1e12) * px.xmr) : ''
  const check = useMemo(() => (addr.trim() ? checkMoneroAddress(addr) : null), [addr])

  // balance of the selected token
  useEffect(() => {
    setBal(null)
    if (!publicKey) return
    let dead = false
    ;(async () => {
      try {
        if (tok.mint === SOL_MINT.toBase58()) {
          const l = await connection.getBalance(publicKey)
          if (!dead) setBal(BigInt(l))
        } else {
          const r = await connection.getParsedTokenAccountsByOwner(publicKey, { mint: new PublicKey(tok.mint) })
          if (!dead) setBal(r.value.reduce((s, a) => s + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n))
        }
      } catch { if (!dead) setBal(null) }
    })()
    return () => { dead = true }
  }, [publicKey, tok, connection, active])

  // debounced quote
  useEffect(() => {
    setQErr('')
    if (!raw || raw <= 0n) { setQuote(null); return }
    const id = ++seq.current
    setQuoting(true)
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/exit/quote?in=${tok.mint}&amount=${raw}`)
        const j = await r.json()
        if (id !== seq.current) return
        if (!r.ok) { setQuote(null); setQErr(j.error || 'No quote') } else setQuote(j)
      } catch { if (id === seq.current) setQErr('No quote right now') }
      finally { if (id === seq.current) setQuoting(false) }
    }, 450)
    return () => clearTimeout(t)
  }, [raw, tok])

  // refresh the quote every 20s while idle
  useEffect(() => {
    if (!quote || busy) return
    const t = setTimeout(() => setAmount((a) => a + ''), 20_000)
    return () => clearTimeout(t)
  }, [quote, busy])

  const max = () => {
    if (bal === null) return
    const keep = tok.mint === SOL_MINT.toBase58() ? 15_000_000n : 0n // leave SOL for fees and rent
    const v = bal > keep ? bal - keep : 0n
    setAmount(fromRaw(v, tok.decimals, tok.decimals).replace(/,/g, ''))
  }

  const tooMuch = raw !== null && bal !== null && raw > bal
  const ready = connected && publicKey && raw && raw > 0n && quote?.ok && check?.ok && !tooMuch && !busy

  async function go() {
    if (!publicKey || !raw || !check?.ok) return
    setErr('')
    setBusy('Building your transaction…')
    try {
      const r = await fetch('/api/exit/build', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wallet: publicKey.toBase58(), inputMint: tok.mint, amount: raw.toString(), xmrAddress: addr.trim() }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not build the exit')
      const tx = VersionedTransaction.deserialize(Buffer.from(j.tx, 'base64'))
      const alts = (await Promise.all(tx.message.addressTableLookups.map((l) => connection.getAddressLookupTable(l.accountKey))))
        .map((x) => x.value).filter((v): v is NonNullable<typeof v> => !!v)
      if (alts.length !== tx.message.addressTableLookups.length) throw new Error('Could not read the route tables. Try again.')
      // the transaction must deliver at least what you were shown, less 3% for price movement
      const shown = quote ? BigInt(quote.minOut) : 0n
      const bad = verifyExit(tx, alts, { user: publicKey, xmrAddress: addr.trim(), minAmount: (shown * 97n) / 100n })
      if (bad) throw new Error(`Refusing to sign: ${bad}`)
      setBusy('Approve in your wallet…')
      const sig = await sendTransaction(tx, connection, { skipPreflight: false, maxRetries: 3 })
      const rec: ExitRecord = { w: j.withdrawal, nonce: j.nonce, xmrAddress: addr.trim(), sig, at: Math.floor(Date.now() / 1000), xmrOutMin: j.quote.xmrOutMin, from: `${amount} ${tok.symbol}` }
      saveExit(rec)
      saveLastToken(tok)
      setActive(rec)
      window.history.replaceState(null, '', `/swap?w=${j.withdrawal}`)
      setBusy('')
      setAmount('')
    } catch (e: any) {
      setBusy('')
      const m = String(e?.message || e)
      setErr(/reject|declin|cancel/i.test(m) ? 'You cancelled in your wallet.' : m)
    }
  }

  async function cancel(rec: ExitRecord) {
    if (!publicKey || !rec.nonce) return
    const { cancelWithdrawalIx } = await import('@/lib/bridge')
    const tx = new Transaction().add(cancelWithdrawalIx(publicKey, BigInt(rec.nonce)))
    await sendTransaction(tx, connection)
  }

  if (active) {
    return (
      <div className="panel-body">
        <Tracker rec={active} onCancel={publicKey && active.nonce ? () => cancel(active) : undefined} />
        <button className="btn btn-block" onClick={() => { setActive(null); window.history.replaceState(null, '', '/swap') }}>New exit</button>
      </div>
    )
  }

  return (
    <div className="panel-body">
      <div className="field">
        <div className="field-top">
          <span>You send</span>
          {bal !== null && <button type="button" onClick={max}>Balance {fromRaw(bal, tok.decimals, 4)} · Max</button>}
        </div>
        <div className={`box${tooMuch ? ' bad' : ''}`}>
          <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} aria-label="Amount to send" aria-invalid={tooMuch} autoComplete="off" />
          <TokenPicker value={tok} onChange={setTok} />
        </div>
        {sendUsd && <span className="hint num">{sendUsd}</span>}
        {tooMuch && <span className="hint bad">More than your balance.</span>}
      </div>

      <div className="arrow" aria-hidden>↓</div>

      <div className="field">
        <div className="field-top"><span>You receive (about)</span><span>Monero network</span></div>
        <div className="box">
          <div className="out" aria-live="polite" aria-atomic>{quoting && !quote ? <span className="faint">…</span> : quote ? <>{xmr(quote.xmrOut, 5)}</> : <span className="faint">0.00</span>}</div>
          <span className="asset static"><span className="dot"><img src="/img/xmr.webp" alt="" /></span>XMR</span>
        </div>
        {gotUsd && <span className="hint num">{gotUsd}</span>}
        {qErr && <span className="hint bad">{qErr}</span>}
        {quote && !quote.ok && <span className="hint bad">{quote.reason}</span>}
      </div>

      <div className="field">
        <div className="field-top"><span>Your Monero address</span>{check?.ok && <span className="xmr">{check.kind === 'subaddress' ? 'Subaddress' : check.kind === 'integrated' ? 'Integrated address' : 'Primary address'}</span>}</div>
        <div className={`box${check && !check.ok ? ' bad' : ''}`}>
          <textarea rows={3} spellCheck={false} placeholder="Starts with 8 or 4. A fresh subaddress is best." value={addr} onChange={(e) => setAddr(e.target.value.replace(/\s/g, ''))} aria-label="Your Monero address" aria-invalid={!!check && !check.ok} aria-describedby={check && !check.ok ? 'sx-addr-err' : undefined} autoComplete="off" autoCapitalize="off" autoCorrect="off" />
        </div>
        {check && !check.ok && <span className="hint bad" id="sx-addr-err">{check.reason}</span>}
        {check?.ok && check.kind === 'standard' && <span className="hint">Works. A subaddress (starts with 8) keeps exits from linking to each other.</span>}
      </div>

      {quote?.ok && (
        <div className="facts">
          <div><span>At least</span><span className="num">{xmr(quote.xmrOutMin, 5)} XMR</span></div>
          <div><span>Nero fee</span><span className="num">{BigInt(quote.platformFee) > 0n ? `${PLATFORM_FEE_BPS / 100}% · ${xmr(quote.platformFee, 5)} XMR` : '0%'}</span></div>
          <div><span>Bridge fee</span><span className="num">{quote.bridgeFeeBps / 100}%</span></div>
          <div><span>Route</span><span>{quote.route.join(' → ')} → wXMR bridge</span></div>
          <div><span>Price impact</span><span className="num">{quote.priceImpactPct < 0.01 ? '<0.01' : quote.priceImpactPct.toFixed(2)}%</span></div>
        </div>
      )}

      {err && <div className="note bad" role="alert">{err}</div>}

      {!connected ? (
        <ConnectButton block size="lg" />
      ) : (
        <button className="btn btn-primary btn-lg btn-block" disabled={!ready} onClick={go}>
          {busy || (!raw ? 'Enter an amount' : !check?.ok ? 'Add your Monero address' : tooMuch ? 'Not enough balance' : !quote ? 'Getting a quote…' : !quote.ok ? 'Below the 0.1 XMR minimum' : 'Exit to Monero')}
        </button>
      )}
      <p className="hint" style={{ textAlign: 'center', margin: 0 }}>One signature. If any part fails, nothing moves.</p>
    </div>
  )
}
