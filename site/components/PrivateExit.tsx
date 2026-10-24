'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import ConnectButton from './ConnectButton'
import { rowKeys } from '@/lib/a11y'
import TokenPicker, { type Tok } from './TokenPicker'
import PrivateDeposit from './PrivateDeposit'
import PrivateCross from './PrivateCross'
import type { XAssetLive } from '@/lib/xchain'
import OrderAlert from './OrderAlert'
import { EXIT_TOKENS, SOL_MINT } from '@/lib/constants'
import { checkMoneroAddress } from '@/lib/monero'
import { approxUsd, fromRaw, toRaw, xmr } from '@/lib/format'
import { usePrices } from '@/lib/usePrices'
import ShareExit from './ShareExit'
import OrderLink from './OrderLink'
import ProofGuide from './ProofGuide'
import PromiseLine from './PromiseLine'
import OrderHelp from './OrderHelp'
import { ELSEWHERE, madeElsewhere } from '@/lib/orderLink'
import { STANDARD_NOTE, standardWhy } from '@/lib/standardHint'
import { loadLastToken, mayUseRemembered, saveLastToken } from '@/lib/lastToken'
import { buildOrderTx, checkPromise, checkQuote, loadV2, newSecret, orderMemo, saveV2, sealAddress, SOLVER_DEPOSIT, verifyV2, type V2Order } from '@/lib/v2'

type Info = { enabled: boolean; minPico: string; maxPico: string; availablePico: string | null; spreadBps: number }
type Quote = { quoteId: string; lamports: string; xmrOut: string; expiresAt: number; swapQuote: any | null }
type Status = { status: string; reason?: string; xmrOut?: string; refundSig?: string; xmrTx?: string; txKey?: string }

export default function PrivateExit({ onStandard, onMode }: { onStandard?: (v: { tok: Tok; amount: string; addr: string }) => void; onMode?: (m: 'wallet' | 'send' | 'x') => void }) {
  const { connection } = useConnection()
  const { publicKey, sendTransaction, connected } = useWallet()
  const [info, setInfo] = useState<Info | null>(null)
  const [tok, setTok] = useState<Tok>(EXIT_TOKENS[0])
  const [bal, setBal] = useState<bigint | null>(null)
  const [amount, setAmount] = useState('')
  const [addr, setAddr] = useState('')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [qErr, setQErr] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [active, setActive] = useState<V2Order | null>(null)
  const [mode, setMode] = useState<'wallet' | 'send' | 'x'>('wallet')
  useEffect(() => { onMode?.(mode) }, [mode, onMode]) // the text beside the form follows the way of sending
  const [xinfo, setXinfo] = useState<{ open: boolean; floatOpen?: boolean; maxPico: string | null; feeBps: number | null; assets: XAssetLive[] } | null>(null)
  const [xPreview, setXPreview] = useState(false)
  const [st, setSt] = useState<Status | null>(null)
  const [est, setEst] = useState<string | null>(null) // SOL only, before a wallet is connected
  const [renew, setRenew] = useState(0)
  const [elsewhere, setElsewhere] = useState(false) // opened with a link to an order this browser does not hold
  const [copied, setCopied] = useState('')
  const copy = (what: string, text: string) => { navigator.clipboard?.writeText(text).then(() => { setCopied(what); setTimeout(() => setCopied(''), 1500) }).catch(() => {}) }
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const seq = useRef(0)

  useEffect(() => { fetch('/api/v2/info').then((r) => r.json()).then(setInfo).catch(() => setInfo(null)) }, [])
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (q.get('d')) setMode('send') // a no-connect order link
    if (q.get('x')) setMode('x') // an order from another chain
    if (q.get('xpreview')) setXPreview(true)
    fetch('/api/x/assets').then((r) => (r.ok ? r.json() : null)).then(setXinfo).catch(() => {})
    const s = q.get('o')
    if (s) { const all = loadV2(); const known = all.find((o) => o.sig === s); if (known) setActive(known); else setElsewhere(madeElsewhere('wallet', s, all.map((o) => o.sig))) }
    // the home page quote bar continues here
    const pre = EXIT_TOKENS.find((t) => t.mint === q.get('in'))
    if (pre) setTok(pre)
    // no token or amount in the link: start from the token of the last exit made in this browser
    else if (mayUseRemembered(window.location.search)) { const last = loadLastToken(); if (last) setTok(last) }
    const amt = q.get('amount')
    if (amt && /^[0-9]*[.]?[0-9]*$/.test(amt)) setAmount(amt)
  }, [])

  const raw = useMemo(() => toRaw(amount, tok.decimals), [amount, tok])
  const px = usePrices(tok.mint)
  const sendUsd = raw && raw > 0n ? approxUsd((Number(raw) / 10 ** tok.decimals) * px.tok) : ''
  const check = useMemo(() => (addr.trim() ? checkMoneroAddress(addr) : null), [addr])

  // balance of the selected token
  useEffect(() => {
    setBal(null)
    if (!publicKey) return
    let dead = false
    ;(async () => {
      try {
        if (tok.mint === SOL_MINT.toBase58()) { const l = await connection.getBalance(publicKey); if (!dead) setBal(BigInt(l)) }
        else {
          const r = await connection.getParsedTokenAccountsByOwner(publicKey, { mint: new PublicKey(tok.mint) })
          if (!dead) setBal(r.value.reduce((s, a) => s + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n))
        }
      } catch { if (!dead) setBal(null) }
    })()
    return () => { dead = true }
  }, [publicKey, tok, connection, active])

  // quotes are bound to your wallet, so they need a connected wallet
  useEffect(() => {
    setQErr('')
    if (!info?.enabled || !publicKey || !raw || raw <= 0n) { setQuote(null); return }
    const id = ++seq.current
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/v2/quote?in=${tok.mint}&amount=${raw}&wallet=${publicKey.toBase58()}`)
        const j = await r.json()
        if (id !== seq.current) return
        if (!r.ok) { setQuote(null); setQErr(j.error || 'No quote') } else setQuote(j)
      } catch { if (id === seq.current) setQErr('No quote right now') }
    }, 450)
    return () => clearTimeout(t)
  }, [raw, tok, publicKey, info, renew])

  // a quote lives 60 seconds: get a new one before it lapses, and count down what is left
  useEffect(() => {
    if (!quote || busy) return
    const t = setTimeout(() => setRenew((n) => n + 1), Math.max(5_000, (quote.expiresAt - 15) * 1000 - Date.now()))
    return () => clearTimeout(t)
  }, [quote, busy])
  useEffect(() => {
    if (!quote) return
    setNow(Math.floor(Date.now() / 1000))
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(t)
  }, [quote])

  // no wallet yet: an indicative figure for SOL, so the page is not empty before connecting
  useEffect(() => {
    setEst(null)
    if (!info?.enabled || publicKey || tok.mint !== SOL_MINT.toBase58() || !raw || raw <= 0n) return
    let dead = false
    const t = setTimeout(async () => {
      try { const j = await (await fetch(`/api/v2/estimate?amount=${raw}`)).json(); if (!dead && j.xmrOut) setEst(j.xmrOut) } catch {}
    }, 450)
    return () => { dead = true; clearTimeout(t) }
  }, [raw, tok, publicKey, info])

  // follow an order until it is paid or refunded
  useEffect(() => {
    if (!active) return
    let dead = false
    const poll = async () => {
      try {
        const j = await (await fetch(`/api/v2/order?sig=${active.sig}&s=${active.secret}`)).json()
        if (!dead) setSt(j)
        if (!dead && !['paid', 'refunded'].includes(j.status)) setTimeout(poll, 3000)
      } catch { if (!dead) setTimeout(poll, 5000) }
    }
    poll()
    return () => { dead = true }
  }, [active])

  const max = () => {
    if (bal === null) return
    const keep = tok.mint === SOL_MINT.toBase58() ? 15_000_000n : 0n // leave SOL for fees
    setAmount(fromRaw(bal > keep ? bal - keep : 0n, tok.decimals, tok.decimals).replace(/,/g, ''))
  }
  const tooMuch = raw !== null && bal !== null && raw > bal
  // the float can't cover this one (too big, used up for today, or paused): the standard exit can
  // or the solver is waiting out a price gap: the standard exit still quotes, at the market's own price
  const why = standardWhy(info ? !!info.enabled : null, qErr)
  const ready = connected && publicKey && quote && check?.ok && !tooMuch && !busy
  // what the quote works out to, in whichever direction reads as a normal number
  const rate = useMemo(() => {
    if (!quote || !raw || raw <= 0n) return null
    const per = Number(quote.xmrOut) / 1e12 / (Number(raw) / 10 ** tok.decimals)
    if (!isFinite(per) || per <= 0) return null
    const n = (v: number) => v.toLocaleString('en-US', { maximumSignificantDigits: 5 })
    return per >= 0.001 ? `1 ${tok.symbol} = ${n(per)} XMR` : `1 XMR = ${n(1 / per)} ${tok.symbol}`
  }, [quote, raw, tok])
  const impact = quote?.swapQuote?.priceImpactPct != null ? Math.abs(Number(quote.swapQuote.priceImpactPct)) * 100 : null
  const left = quote ? Math.max(0, quote.expiresAt - now) : 0
  const gotPico = quote ? quote.xmrOut : est
  const gotUsd = gotPico ? approxUsd((Number(gotPico) / 1e12) * px.xmr) : ''

  async function go() {
    if (!publicKey || !quote || !check?.ok || !raw) return
    setErr('')
    setBusy('Sealing your address…')
    try {
      // the quote must be for exactly what you typed, before anything else happens
      const qbad = checkQuote(quote, { inputMint: tok.mint, amount: raw })
      if (qbad) throw new Error(`Refusing: ${qbad}`)
      const sealed = sealAddress(addr.trim())
      const { secret, hash } = newSecret()
      const memo = orderMemo(quote.quoteId, hash, sealed)
      setBusy('Reserving your XMR…')
      const r = await fetch('/api/v2/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quoteId: quote.quoteId, sealed, secretHash: hash }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not reserve this order')
      if (j.memo !== memo || BigInt(j.lamports) !== BigInt(quote.lamports)) throw new Error('Refusing: the solver answered for a different order')
      const pbad = checkPromise(j.promise, { lamports: String(quote.lamports), xmrOut: String(quote.xmrOut), to: SOLVER_DEPOSIT.toBase58(), sealed })
      if (pbad) throw new Error(`Refusing: ${pbad}`)
      setBusy('Building your order…')
      // built here, in your browser: the swap instructions come straight from the router, the transfer and memo from this page
      const { tx, alts } = await buildOrderTx(connection, { user: publicKey, lamports: BigInt(quote.lamports), memo, swapQuote: quote.swapQuote })
      const bad = verifyV2(tx, alts, { user: publicKey, lamports: BigInt(quote.lamports), memo })
      if (bad) throw new Error(`Refusing to sign: ${bad}`)
      setBusy('Approve in your wallet…')
      const sig = await sendTransaction(tx, connection, { skipPreflight: false, maxRetries: 3 })
      const o: V2Order = { sig, secret, at: Math.floor(Date.now() / 1000), from: `${amount} ${tok.symbol}`, xmrOut: quote.xmrOut, promise: j.promise }
      saveV2(o)
      saveLastToken(tok)
      setActive(o); setElsewhere(false)
      window.history.replaceState(null, '', `/swap?tab=private&o=${sig}`)
      setBusy(''); setAmount('')
    } catch (e: any) {
      setBusy('')
      const m = String(e?.message || e)
      setErr(/reject|declin|cancel/i.test(m) ? 'You cancelled in your wallet.' : m)
    }
  }

  if (active) {
    const s = st?.status || 'waiting'
    const label: Record<string, string> = {
      waiting: 'Waiting for your transaction to finalize…', paying: 'Sending your XMR…', paid: 'Sent to your Monero address',
      refund_pending: 'Refunding your SOL…', refunding: 'Refunding your SOL…', refunded: 'Refunded', stuck: 'Being checked by hand', held: 'Received without an order: being checked by hand',
    }
    return (
      <div className="panel-body">
        <div className="facts">
          <div><span>Order</span><span>{active.from} → {xmr(active.xmrOut, 5)} XMR</span></div>
          <div><span>Status</span><span role="status" className={s === 'paid' ? 'xmr' : ''}>{label[s] || s}</span></div>
          {st?.reason && s !== 'paid' && <div><span>Why</span><span>{st.reason}</span></div>}
          {st?.xmrTx && <div><span>Monero tx</span><button type="button" className="mono" title="Copy" style={{ background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer', wordBreak: 'break-all', textAlign: 'right', font: 'inherit' }} onClick={() => copy('tx', st.xmrTx!)}>{copied === 'tx' ? 'Copied' : st.xmrTx}<span className="sr-only">, copy</span></button></div>}
          {st?.txKey && <div><span>Tx key (proof)</span><button type="button" className="mono" title="Copy" style={{ background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer', wordBreak: 'break-all', textAlign: 'right', font: 'inherit' }} onClick={() => copy('key', st.txKey!)}>{copied === 'key' ? 'Copied' : st.txKey}<span className="sr-only">, copy</span></button></div>}
          {st?.refundSig && <div><span>Refund</span><a className="mono" href={`https://solscan.io/tx/${st.refundSig}`} target="_blank" rel="noreferrer">{st.refundSig.slice(0, 16)}…</a></div>}
          <div><span>Solana tx</span><a className="mono" href={`https://solscan.io/tx/${active.sig}`} target="_blank" rel="noreferrer">{active.sig.slice(0, 16)}…</a></div>
        </div>
        <p className="hint">{s === 'paid' ? 'Open your Monero wallet: the payment shows within a minute or two and can be spent after 10 confirmations, about 20 minutes. Tap the tx or the key to copy it. The proof is only shown in this browser.' : s === 'refunded' ? 'Your SOL is back in the wallet that sent it, minus the network fee. You can start a new exit.' : s === 'stuck' || s === 'held' ? 'Nothing is lost and nothing more is sent until a person has checked it. Keep this page link.' : 'Keep this page open or save its link. Nothing else is needed from you.'}</p>
        {st?.txKey && <ProofGuide />}
        {active.promise && <PromiseLine p={active.promise} />}
        <OrderHelp kind="wallet" status={s} />
        <OrderLink kind="wallet" id={active.sig} />
        <OrderAlert known={!!st?.status} outcome={s === 'paid' ? 'paid' : s === 'refunded' ? 'refunded' : null} />
        {s === 'paid' && <ShareExit kind="wallet" />}
        <button className="btn btn-block" onClick={() => { setActive(null); setSt(null); window.history.replaceState(null, '', '/swap?tab=private') }}>New private exit</button>
      </div>
    )
  }

  const closed = info && !info.enabled
  // exits from other chains appear once the solver has them switched on (or for someone holding an order link)
  const showX = !!xinfo?.open || xPreview || mode === 'x'
  const modeList = (showX
    ? [['wallet', 'Wallet', 'Any Solana token'], ['send', 'Send SOL', 'No connection'], ['x', 'Other assets', 'USDC, ETH, other chains']]
    : [['wallet', 'Wallet', 'Any Solana token'], ['send', 'Send SOL', 'No connection']]) as ['wallet' | 'send' | 'x', string, string][]
  const modes = (
    <div role="radiogroup" aria-label="How to send" onKeyDown={rowKeys(modeList.map(([m]) => m), mode, setMode, 'radio')} style={{ display: 'grid', gridTemplateColumns: `repeat(${modeList.length}, minmax(0, 1fr))`, gap: 4, padding: 4, background: 'var(--bg)', borderRadius: 12 }}>
      {modeList.map(([m, a, b]) => (
        <button key={m} type="button" role="radio" aria-checked={mode === m} tabIndex={mode === m ? 0 : -1} onClick={() => setMode(m)} style={{ height: 46, border: 0, borderRadius: 9, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, minWidth: 0, background: mode === m ? 'var(--bg-3)' : 'transparent', color: mode === m ? 'var(--text)' : 'var(--muted)' }}>
          <b style={{ fontWeight: 500, fontSize: 13.5, whiteSpace: 'nowrap' }}>{a}</b><span style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{b}</span>
        </button>
      ))}
    </div>
  )
  if (mode === 'x') return <div className="panel-body">{modes}<PrivateCross info={xinfo} preview={xPreview} /></div>
  if (mode === 'send') return <div className="panel-body">{modes}<PrivateDeposit enabled={!!info?.enabled} initialAmount={tok.symbol === 'SOL' ? amount : ''} /></div>
  return (
    <div className="panel-body">
      {modes}
      {elsewhere && <div className="note" role="status">{ELSEWHERE}</div>}
      <div className="note">
        <b>Private exit.</b> Our solver pays you real XMR from its own Monero wallet. Your Monero address is sealed in this browser and never appears on Solana.
      </div>
      <div className="field">
        <div className="field-top">
          <span>You send</span>
          {bal !== null && <button type="button" onClick={max}>Balance {fromRaw(bal, tok.decimals, 4)} · Max</button>}
        </div>
        <div className={`box${tooMuch ? ' bad' : ''}`}>
          <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))} aria-label="Amount to send" aria-invalid={tooMuch} autoComplete="off" />
          <TokenPicker value={tok} onChange={setTok} />
        </div>
        {sendUsd && <span className="hint num">{sendUsd}</span>}
        {tooMuch && <span className="hint bad">More than your balance.</span>}
      </div>
      <div className="arrow" aria-hidden>↓</div>
      <div className="field">
        <div className="field-top"><span>{quote || !est ? 'You receive (guaranteed)' : 'You receive (about)'}</span><span>Monero network</span></div>
        <div className="box">
          <div className="out" aria-live="polite" aria-atomic>{quote ? xmr(quote.xmrOut, 5) : est ? <span className="muted">≈ {xmr(est, 4)}</span> : <span className="faint">0.00</span>}</div>
          <span className="asset static"><span className="dot"><img src="/img/xmr.webp" alt="" /></span>XMR</span>
        </div>
        {gotUsd && <span className="hint num">{gotUsd}</span>}
        {qErr && <span className="hint bad">{qErr}</span>}
        {!connected && info?.enabled && <span className="hint">{est ? 'Connect your wallet to lock the exact amount.' : 'Connect your wallet to get a quote.'} Quotes are bound to your wallet and last 60 seconds.</span>}
        {impact !== null && impact >= 3 && <span className="hint bad">This token&apos;s market is thin: about {impact.toFixed(1)}% is lost to price impact on the way to SOL.</span>}
      </div>
      <div className="field">
        <div className="field-top"><span>Your Monero address</span>{check?.ok && <span className="xmr">Sealed before it leaves this page</span>}</div>
        <div className={`box${check && !check.ok ? ' bad' : ''}`}>
          <textarea rows={3} spellCheck={false} placeholder="Starts with 8 or 4. A fresh subaddress is best." value={addr} onChange={(e) => setAddr(e.target.value.replace(/\s/g, ''))} aria-label="Your Monero address" aria-invalid={!!check && !check.ok} aria-describedby={check && !check.ok ? 'px-addr-err' : undefined} autoComplete="off" autoCapitalize="off" autoCorrect="off" />
        </div>
        {check && !check.ok && <span className="hint bad" id="px-addr-err">{check.reason}</span>}
      </div>
      {info && (
        <div className="facts">
          {quote && rate && <div><span>Rate</span><span className="num">{rate}</span></div>}
          {quote && impact !== null && <div><span>Price impact</span><span className="num">{impact < 0.01 ? 'Under 0.01%' : `${impact.toFixed(2)}%`}</span></div>}
          {quote && <div><span>Quote held for</span><span className="num">{left > 15 ? `${left} s` : 'Renewing…'}</span></div>}
          <div><span>You get</span><span>Exactly the quoted XMR, or your SOL back</span></div>
          <div><span>Fee</span><span className="num">{info.spreadBps / 100}%, built into the quote</span></div>
          <div><span>Per order</span><span className="num">{xmr(info.minPico, 2)}–{xmr(info.maxPico, 2)} XMR</span></div>
          <div><span>Available now</span><span className="num">{info.availablePico === null ? '…' : `${xmr(info.availablePico, 3)} XMR`}</span></div>
          <div><span>Still public</span><span>Your Solana wallet sent SOL to Nero. Not where the XMR went.</span></div>
        </div>
      )}
      {why && onStandard && (
        <div className="note">
          {STANDARD_NOTE[why]}
          <button className="btn btn-block" style={{ marginTop: 10 }} onClick={() => onStandard({ tok, amount, addr })}>Use the standard exit</button>
        </div>
      )}
      {err && <div className="note bad" role="alert">{err}</div>}
      {closed ? (
        <button className="btn btn-primary btn-lg btn-block" disabled>Private exit opens soon</button>
      ) : !connected ? (
        <ConnectButton block size="lg" />
      ) : (
        <button className="btn btn-primary btn-lg btn-block" disabled={!ready} onClick={go}>
          {busy || (!raw ? 'Enter an amount' : tooMuch ? 'Not enough balance' : !check?.ok ? 'Add your Monero address' : !quote ? (qErr ? 'No quote' : 'Getting a quote…') : 'Exit privately')}
        </button>
      )}
      <p className="hint" style={{ textAlign: 'center', margin: 0 }}>If we can&apos;t pay it, your SOL comes back automatically.</p>
    </div>
  )
}
