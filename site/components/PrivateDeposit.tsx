'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { PublicKey } from '@solana/web3.js'
import QRCode from 'qrcode'
import { checkMoneroAddress } from '@/lib/monero'
import { approxUsd, fromRaw, toRaw, xmr } from '@/lib/format'
import { usePrices } from '@/lib/usePrices'
import { SOL_MINT } from '@/lib/constants'
import { checkPromise, newSecret, sealAddress, type OrderPromise } from '@/lib/v2'
import PromiseLine from './PromiseLine'
import OrderAlert from './OrderAlert'
import ShareExit from './ShareExit'
import OrderLink from './OrderLink'
import ProofGuide from './ProofGuide'
import OrderHelp from './OrderHelp'
import { ELSEWHERE, madeElsewhere } from '@/lib/orderLink'

/*
  Private exit without connecting a wallet: you get a one-time deposit address, send SOL to it from any wallet or
  exchange, and the solver pays XMR to your sealed Monero address. A Solana refund address is required, because the
  sender of an exchange withdrawal is not you.
*/
type Deposit = { address: string; lamports: string; xmrOut: string; expiresAt: number; secret: string; at: number; promise?: OrderPromise }
type Status = { status: string; reason?: string; received?: string; refundSig?: string; xmrTx?: string; txKey?: string }

const STORE = 'nero.v2deposits'
const load = (): Deposit[] => { try { return JSON.parse(localStorage.getItem(STORE) || '[]') } catch { return [] } }
const keep = (d: Deposit) => { try { localStorage.setItem(STORE, JSON.stringify([d, ...load().filter((x) => x.address !== d.address)].slice(0, 20))) } catch {} }

function validSolana(a: string): boolean {
  try { return PublicKey.isOnCurve(new PublicKey(a).toBytes()) } catch { return false }
}

export default function PrivateDeposit({ enabled, initialAmount = '' }: { enabled: boolean; initialAmount?: string }) {
  const [amount, setAmount] = useState(initialAmount)
  const [addr, setAddr] = useState('')
  const [refund, setRefund] = useState('')
  const [est, setEst] = useState<{ xmrOut: string; ttl: number; feeBps: number } | null>(null)
  const [eErr, setEErr] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [dep, setDep] = useState<Deposit | null>(null)
  const [st, setSt] = useState<Status | null>(null)
  const [qr, setQr] = useState('')
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const [copied, setCopied] = useState('')
  const [elsewhere, setElsewhere] = useState(false) // opened with a link to an order this browser does not hold
  const seq = useRef(0)

  const raw = useMemo(() => toRaw(amount, 9), [amount])
  const px = usePrices(SOL_MINT.toBase58())
  const sendUsd = raw && raw > 0n ? approxUsd((Number(raw) / 1e9) * px.tok) : ''
  const gotUsd = est ? approxUsd((Number(est.xmrOut) / 1e12) * px.xmr) : ''
  const check = useMemo(() => (addr.trim() ? checkMoneroAddress(addr) : null), [addr])
  const refundOk = useMemo(() => (refund.trim() ? validSolana(refund.trim()) : null), [refund])

  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get('d')
    if (d) { const all = load(); const known = all.find((o) => o.address === d); if (known) setDep(known); else setElsewhere(madeElsewhere('send', d, all.map((o) => o.address))) }
  }, [])

  // estimate (no reservation until you create the order)
  useEffect(() => {
    setEErr('')
    if (!enabled || !raw || raw <= 0n) { setEst(null); return }
    const id = ++seq.current
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/v2/estimate?amount=${raw}`)
        const j = await r.json()
        if (id !== seq.current) return
        if (!r.ok) { setEst(null); setEErr(j.error || 'No estimate') } else setEst(j)
      } catch { if (id === seq.current) setEErr('No estimate right now') }
    }, 450)
    return () => clearTimeout(t)
  }, [raw, enabled])

  // order view: QR, clock, status
  useEffect(() => {
    if (!dep) return
    const sol = fromRaw(BigInt(dep.lamports), 9, 9).replace(/,/g, '')
    QRCode.toDataURL(`solana:${dep.address}?amount=${sol}`, { margin: 1, width: 360, color: { dark: '#0b0908', light: '#f6f1ea' } }).then(setQr).catch(() => setQr(''))
    const clock = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    let dead = false
    const poll = async () => {
      try {
        const j = await (await fetch(`/api/v2/order?addr=${dep.address}&s=${dep.secret}`)).json()
        if (!dead) setSt(j)
        if (!dead && !['paid', 'refunded', 'closed'].includes(j.status)) setTimeout(poll, 4000)
      } catch { if (!dead) setTimeout(poll, 6000) }
    }
    poll()
    return () => { dead = true; clearInterval(clock) }
  }, [dep])

  const copy = (what: string, text: string) => { navigator.clipboard?.writeText(text).then(() => { setCopied(what); setTimeout(() => setCopied(''), 1500) }).catch(() => {}) }

  async function create() {
    if (!raw || !check?.ok || !refundOk) return
    setErr(''); setBusy('Sealing your address…')
    try {
      const sealed = sealAddress(addr.trim())
      const { secret, hash } = newSecret()
      setBusy('Creating your deposit address…')
      const r = await fetch('/api/v2/address', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount: raw.toString(), sealed, secretHash: hash, refund: refund.trim() }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not create the order')
      if (BigInt(j.lamports) !== raw) throw new Error('Refusing: the order is for a different amount')
      const pbad = checkPromise(j.promise, { lamports: String(j.lamports), xmrOut: String(j.xmrOut), to: j.address, sealed })
      if (pbad) throw new Error(`Refusing: ${pbad}`)
      const d: Deposit = { address: j.address, lamports: j.lamports, xmrOut: j.xmrOut, expiresAt: j.expiresAt, secret, at: Math.floor(Date.now() / 1000), promise: j.promise }
      keep(d); setDep(d); setSt(null); setElsewhere(false)
      window.history.replaceState(null, '', `/swap?tab=private&d=${j.address}`)
      setBusy('')
    } catch (e: any) { setBusy(''); setErr(String(e?.message || e)) }
  }

  if (dep) {
    const s = st?.status || 'awaiting'
    const left = Math.max(0, dep.expiresAt - now)
    const sol = fromRaw(BigInt(dep.lamports), 9, 9).replace(/,/g, '').replace(/0+$/, '').replace(/\.$/, '')
    const label: Record<string, string> = {
      awaiting: 'Waiting for your SOL', waiting: 'Looking for this order…', paying: 'Sending your XMR…', paid: 'Sent to your Monero address', expired: 'Expired. Nothing was received',
      refund_pending: 'Refunding your SOL…', refunding: 'Refunding your SOL…', refunded: 'Refunded to your refund address', stuck: 'Being checked by hand', closed: 'Closed',
    }
    const waiting = s === 'awaiting'
    return (
      <>
        {waiting && (
          <>
            <div className="note"><b>Send exactly {sol} SOL</b> to this address, from any wallet or exchange, within {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}.</div>
            {qr && <img src={qr} alt="Deposit QR code" width={180} height={180} style={{ alignSelf: 'center', borderRadius: 14 }} />}
            <div className="facts">
              <div><span>Deposit address</span><button type="button" className="mono" style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', wordBreak: 'break-all', textAlign: 'right' }} onClick={() => copy('a', dep.address)}>{copied === 'a' ? 'Copied' : dep.address}<span className="sr-only">, copy</span></button></div>
              <div><span>Amount</span><button type="button" className="mono" style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer' }} onClick={() => copy('n', sol)}>{copied === 'n' ? 'Copied' : `${sol} SOL`}<span className="sr-only">, copy</span></button></div>
              <div><span>You receive</span><span className="num">{xmr(dep.xmrOut, 5)} XMR</span></div>
            </div>
            <p className="hint">Send SOL only, on Solana, in one transfer. Less than the amount, or anything after the timer, is sent back to your refund address.</p>
          </>
        )}
        <div className="facts">
          <div><span>Status</span><span role="status" className={s === 'paid' ? 'xmr' : ''}>{label[s] || s}</span></div>
          {!waiting && <div><span>Order</span><span>{sol} SOL → {xmr(dep.xmrOut, 5)} XMR</span></div>}
          {st?.reason && s !== 'paid' && <div><span>Why</span><span>{st.reason}</span></div>}
          {st?.xmrTx && <div><span>Monero tx</span><button type="button" className="mono" title="Copy" style={{ background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer', wordBreak: 'break-all', textAlign: 'right', font: 'inherit' }} onClick={() => copy('tx', st.xmrTx!)}>{copied === 'tx' ? 'Copied' : st.xmrTx}<span className="sr-only">, copy</span></button></div>}
          {st?.txKey && <div><span>Tx key (proof)</span><button type="button" className="mono" title="Copy" style={{ background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer', wordBreak: 'break-all', textAlign: 'right', font: 'inherit' }} onClick={() => copy('key', st.txKey!)}>{copied === 'key' ? 'Copied' : st.txKey}<span className="sr-only">, copy</span></button></div>}
          {st?.refundSig && <div><span>Refund</span><a className="mono" href={`https://solscan.io/tx/${st.refundSig}`} target="_blank" rel="noreferrer">{st.refundSig.slice(0, 16)}…</a></div>}
        </div>
        <p className="hint">Keep this page or its link: the payment proof is only shown to this browser.</p>
        {st?.txKey && <ProofGuide />}
        {dep.promise && <PromiseLine p={dep.promise} />}
        <OrderHelp kind="send" status={s} />
        <OrderLink kind="send" id={dep.address} />
        <OrderAlert known={!!st?.status && !['expired', 'closed'].includes(s)} outcome={s === 'paid' ? 'paid' : s === 'refunded' ? 'refunded' : null} />
        {s === 'paid' && <ShareExit kind="send" />}
        <button className="btn btn-block" onClick={() => { setDep(null); setSt(null); window.history.replaceState(null, '', '/swap?tab=private') }}>New order</button>
      </>
    )
  }

  const ready = enabled && raw && raw > 0n && est && check?.ok && refundOk && !busy
  return (
    <>
      {elsewhere && <div className="note" role="status">{ELSEWHERE}</div>}
      <div className="field">
        <div className="field-top"><span>You send</span><span className="faint">From any wallet or exchange</span></div>
        <div className="box">
          <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))} aria-label="Amount of SOL to send" autoComplete="off" />
          <span className="asset static"><span className="dot"><img src="/img/sol.webp" alt="" /></span>SOL</span>
        </div>
        {sendUsd && <span className="hint num">{sendUsd}</span>}
      </div>
      <div className="arrow" aria-hidden>↓</div>
      <div className="field">
        <div className="field-top"><span>You receive (locked for 15 minutes)</span><span>Monero network</span></div>
        <div className="box">
          <div className="out" aria-live="polite" aria-atomic>{est ? xmr(est.xmrOut, 5) : <span className="faint">0.00</span>}</div>
          <span className="asset static"><span className="dot"><img src="/img/xmr.webp" alt="" /></span>XMR</span>
        </div>
        {gotUsd && <span className="hint num">{gotUsd}</span>}
        {eErr && <span className="hint bad">{eErr}</span>}
      </div>
      <div className="field">
        <div className="field-top"><span>Your Monero address</span>{check?.ok && <span className="xmr">Sealed before it leaves this page</span>}</div>
        <div className={`box${check && !check.ok ? ' bad' : ''}`}>
          <textarea rows={3} spellCheck={false} placeholder="Starts with 8 or 4. A fresh subaddress is best." value={addr} onChange={(e) => setAddr(e.target.value.replace(/\s/g, ''))} aria-label="Your Monero address" aria-invalid={!!check && !check.ok} aria-describedby={check && !check.ok ? 'pd-addr-err' : undefined} autoComplete="off" autoCapitalize="off" autoCorrect="off" />
        </div>
        {check && !check.ok && <span className="hint bad" id="pd-addr-err">{check.reason}</span>}
      </div>
      <div className="field">
        <div className="field-top"><span>Solana refund address</span><span className="faint">Only used if we can&apos;t pay</span></div>
        <div className={`box${refundOk === false ? ' bad' : ''}`}>
          <input style={{ fontSize: 14, fontFamily: 'var(--mono)' }} spellCheck={false} placeholder="A Solana wallet you control" value={refund} onChange={(e) => setRefund(e.target.value.replace(/\s/g, ''))} aria-label="Solana refund address" aria-invalid={refundOk === false} aria-describedby={refundOk === false ? 'pd-refund-err' : undefined} autoComplete="off" autoCapitalize="off" autoCorrect="off" />
        </div>
        {refundOk === false && <span className="hint bad" id="pd-refund-err">Enter a Solana wallet address (not an exchange deposit address).</span>}
      </div>
      {est && (
        <div className="facts">
          <div><span>Fee</span><span className="num">{est.feeBps / 100}%, built into the amount</span></div>
          <div><span>How it works</span><span>You get a one-time address. Send, and XMR arrives.</span></div>
          <div><span>Still public</span><span>The transfer to the one-time address. Not where the XMR went.</span></div>
        </div>
      )}
      {err && <div className="note bad" role="alert">{err}</div>}
      <button className="btn btn-primary btn-lg btn-block" disabled={!ready} onClick={create}>
        {busy || (!enabled ? 'Private exit opens soon' : !raw ? 'Enter an amount' : !check?.ok ? 'Add your Monero address' : !refundOk ? 'Add a refund address' : !est ? 'Getting an estimate…' : 'Get deposit address')}
      </button>
      <p className="hint" style={{ textAlign: 'center', margin: 0 }}>No wallet connection. No signature on this site.</p>
    </>
  )
}
