'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { checkMoneroAddress } from '@/lib/monero'
import { approxUsd, toRaw, xmr } from '@/lib/format'
import { newSecret, sealAddress } from '@/lib/v2'
import { checkRefund, roundUpUnits, routeStage, unitsToDecimal, type XAssetLive } from '@/lib/xchain'
import OrderAlert from './OrderAlert'
import ShareExit from './ShareExit'
import OrderLink from './OrderLink'
import ProofGuide from './ProofGuide'
import OrderHelp from './OrderHelp'
import { ELSEWHERE, madeElsewhere } from '@/lib/orderLink'

/*
  Private exit from another chain. You send ETH, USDC or another asset on its own network to a one-time address;
  a route carries it to Solana as SOL, to a one-time address of our solver, and the solver pays XMR to your sealed
  Monero address. No wallet connection anywhere. The route never sees your Monero address.
*/
type XOrder = {
  address: string; lamports: string; xmrOut: string; expiresAt: number
  asset: string; chainName: string; symbol: string; decimals: number
  deposit: string; amountIn: string; deadline: number; secret: string; at: number
  float?: boolean // no locked rate: the XMR is priced when the funds arrive (slow chains)
}
type Status = { status: string; reason?: string; xmrOut?: string; received?: string; repriced?: string; xmrTx?: string; txKey?: string }
type Route = { status: string; originTxs: string[]; unread?: boolean }
type Assets = { open: boolean; floatOpen?: boolean; maxPico: string | null; feeBps: number | null; assets: XAssetLive[] }
type Est = { lamports: string; xmrOut: string; feeBps: number; seconds: number; float?: boolean }
const clock = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
const about = (seconds: number) => (seconds < 90 ? 'a minute' : `${Math.round(seconds / 60)} minutes`)

const STORE = 'nero.xorders'
const load = (): XOrder[] => { try { return JSON.parse(localStorage.getItem(STORE) || '[]') } catch { return [] } }
const keep = (o: XOrder) => { try { localStorage.setItem(STORE, JSON.stringify([o, ...load().filter((x) => x.address !== o.address)].slice(0, 20))) } catch {} }
const plain = { background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer', wordBreak: 'break-all', textAlign: 'right', font: 'inherit' } as const

export default function PrivateCross({ info, preview = false }: { info: Assets | null; preview?: boolean }) {
  // slow chains appear once their own switch is on
  const assets = (info?.assets || []).filter((a) => !a.float || info?.floatOpen || preview)
  const [assetId, setAssetId] = useState('')
  const [pick, setPick] = useState(false)
  const [amount, setAmount] = useState('')
  const [addr, setAddr] = useState('')
  const [refund, setRefund] = useState('')
  const [est, setEst] = useState<Est | null>(null)
  const [eErr, setEErr] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [ord, setOrd] = useState<XOrder | null>(null)
  const [st, setSt] = useState<Status | null>(null)
  const [route, setRoute] = useState<Route | null>(null)
  const [qr, setQr] = useState('')
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const [copied, setCopied] = useState('')
  const [elsewhere, setElsewhere] = useState(false) // opened with a link to an order this browser does not hold
  const seq = useRef(0)
  const menu = useRef<HTMLDivElement>(null)

  const asset = assets.find((a) => a.id === assetId) || assets[0] || null
  const raw = useMemo(() => (asset ? toRaw(amount, asset.decimals) : null), [amount, asset])
  const check = useMemo(() => (addr.trim() ? checkMoneroAddress(addr) : null), [addr])
  const refundCheck = useMemo(() => (asset && refund.trim() ? checkRefund(asset.kind, refund) : null), [refund, asset])
  const sendUsd = asset && raw && raw > 0n ? approxUsd((Number(raw) / 10 ** asset.decimals) * asset.price) : ''

  useEffect(() => {
    const x = new URLSearchParams(window.location.search).get('x')
    if (x) { const all = load(); const known = all.find((o) => o.address === x); if (known) setOrd(known); else setElsewhere(madeElsewhere('x', x, all.map((o) => o.address))) }
  }, [])
  useEffect(() => {
    if (!pick) return
    const close = (e: MouseEvent) => { if (menu.current && !menu.current.contains(e.target as Node)) setPick(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPick(false) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [pick])

  // estimate: nothing is created or reserved until you ask for the order
  useEffect(() => {
    setEErr('')
    if (!asset || !raw || raw <= 0n) { setEst(null); return }
    const id = ++seq.current
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/x/estimate?asset=${encodeURIComponent(asset.id)}&amount=${raw}`)
        const j = await r.json()
        if (id !== seq.current) return
        if (!r.ok) { setEst(null); setEErr(j.error || 'No estimate') } else setEst(j)
      } catch { if (id === seq.current) setEErr('No estimate right now') }
    }, 600)
    return () => clearTimeout(t)
  }, [raw, asset])

  // order view: QR, clock, and both halves of the journey
  useEffect(() => {
    if (!ord) return
    QRCode.toDataURL(ord.deposit, { margin: 1, width: 360, color: { dark: '#0b0908', light: '#f6f1ea' } }).then(setQr).catch(() => setQr(''))
    const clock = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    let dead = false
    const done = { solver: false, route: false }
    const pollSolver = async () => {
      try {
        const r = await fetch(`/api/v2/order?addr=${ord.address}&s=${ord.secret}`)
        const j: Status = await r.json()
        if (dead) return
        if (r.ok && typeof j?.status === 'string') { setSt(j); done.solver = ['paid', 'closed', 'held', 'stuck', 'resolved'].includes(j.status) }
      } catch {}
      if (!dead && !done.solver) setTimeout(pollSolver, 4000)
    }
    const pollRoute = async () => {
      try {
        const r = await fetch(`/api/x/status?deposit=${encodeURIComponent(ord.deposit)}`)
        const j: Route = await r.json()
        if (dead) return
        if (r.ok && typeof j?.status === 'string' && !j.unread) { setRoute(j); done.route = ['SUCCESS', 'REFUNDED', 'FAILED'].includes(j.status) }
      } catch {}
      if (!dead && !done.route && !done.solver) setTimeout(pollRoute, 6000)
    }
    pollSolver(); pollRoute()
    return () => { dead = true; clearInterval(clock) }
  }, [ord])

  const copy = (what: string, text: string) => { navigator.clipboard?.writeText(text).then(() => { setCopied(what); setTimeout(() => setCopied(''), 1500) }).catch(() => {}) }

  async function create() {
    if (!asset || !raw || !check?.ok || !refundCheck?.ok) return
    setErr(''); setBusy('Sealing your address…')
    try {
      const sealed = sealAddress(addr.trim())
      const { secret, hash } = newSecret()
      setBusy('Creating your order…')
      const r = await fetch('/api/x/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ asset: asset.id, amount: raw.toString(), sealed, secretHash: hash, refundTo: refundCheck.value }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not create the order')
      if (j.asset !== asset.id) throw new Error('Refusing: the order is for a different asset')
      // the order may ask for a little more or less than you typed (it is sized to deliver an exact amount), never far from it
      if (BigInt(j.amountIn) > (raw * 103n) / 100n) throw new Error('Refusing: the order asks for more than you entered')
      if (!!j.float !== !!asset.float) throw new Error('Refusing: the order is of a different kind')
      const o: XOrder = { address: j.address, lamports: j.lamports, xmrOut: j.xmrOut, expiresAt: j.expiresAt, asset: asset.id, chainName: asset.chainName, symbol: asset.symbol, decimals: asset.decimals, float: !!asset.float, deposit: j.deposit, amountIn: j.amountIn, deadline: j.deadline, secret, at: Math.floor(Date.now() / 1000) }
      keep(o); setOrd(o); setSt(null); setRoute(null); setElsewhere(false)
      window.history.replaceState(null, '', `/swap?tab=private&x=${j.address}`)
      setBusy('')
    } catch (e: any) { setBusy(''); setErr(String(e?.message || e)) }
  }

  if (ord) {
    const s = st?.status || 'awaiting'
    const stage = routeStage(route?.status)
    const left = Math.max(0, ord.deadline - now)
    // a locked-rate order is rounded up a hair so any wallet or exchange can send it; a rate-on-arrival order is exactly what was typed
    const send = unitsToDecimal(ord.float ? ord.amountIn : roundUpUnits(ord.amountIn, ord.decimals), ord.decimals)
    const got = xmr(st?.xmrOut || ord.xmrOut, 5)
    const paid = s === 'paid'
    const text =
      paid ? 'Sent to your Monero address'
      : s === 'paying' ? 'Sending your XMR…'
      : s === 'held' || s === 'stuck' || s === 'resolved' ? 'Being checked by hand'
      : st?.received && st.received !== '0' && (s === 'expired' || s === 'awaiting') && stage !== 'waiting' && (left === 0 || ord.float) ? 'Received. Your XMR is sent as soon as it is available'
      : stage === 'refunded' ? `Returned to your ${ord.chainName} address`
      : stage === 'failed' ? `The route could not complete this. It returns deposits to your ${ord.chainName} refund address.`
      : stage === 'arrived' ? 'Arrived on Solana. Waiting for it to be final…'
      : stage === 'crossing' ? 'Deposit seen. Crossing to Solana…'
      : left > 0 ? `Waiting for your ${ord.symbol} on ${ord.chainName}` : 'The timer ended and nothing was received'
    const asking = stage === 'waiting' && s === 'awaiting' && left > 0
    const over = paid || stage === 'refunded' || stage === 'failed' || s === 'held' || s === 'stuck' || s === 'resolved' || (stage === 'waiting' && left === 0 && s !== 'paying' && !(st?.received && st.received !== '0'))
    return (
      <>
        {asking && (
          <>
            <div className="note"><b>Send {ord.float ? 'exactly ' : ''}{send} {ord.symbol} on {ord.chainName}</b> to this address, from any wallet or exchange, within {clock(left)}.</div>
            {qr && <img src={qr} alt="Deposit QR code" width={180} height={180} style={{ alignSelf: 'center', borderRadius: 14 }} />}
            <div className="facts">
              <div><span>Deposit address</span><button type="button" className="mono" style={plain} onClick={() => copy('a', ord.deposit)}>{copied === 'a' ? 'Copied' : ord.deposit}<span className="sr-only">, copy</span></button></div>
              <div><span>Network</span><span>{ord.chainName}</span></div>
              <div><span>Amount</span><button type="button" className="mono" style={plain} onClick={() => copy('n', send)}>{copied === 'n' ? 'Copied' : `${send} ${ord.symbol}`}<span className="sr-only">, copy</span></button></div>
              <div><span>You receive</span><span className="num">{ord.float ? `About ${xmr(ord.xmrOut, 4)} XMR, set when it arrives` : `${xmr(ord.xmrOut, 5)} XMR`}</span></div>
            </div>
            {ord.float && <p className="hint">Send {ord.symbol} on {ord.chainName} only, in one transfer, exactly this amount. {ord.chainName} needs confirmations before the route moves, so this can take a while. The XMR you receive is set by the rate at the moment your funds reach Solana. Anything sent after the timer is returned to your {ord.chainName} refund address by the route.</p>}
            {!ord.float && <p className="hint">Send {ord.symbol} on {ord.chainName} only, in one transfer, at least this amount. Anything extra, and anything sent after the timer, is returned to your {ord.chainName} refund address by the route. The wrong network can lose funds.</p>}
          </>
        )}
        <div className="facts">
          <div><span>Status</span><span role="status" className={paid ? 'xmr' : ''}>{text}</span></div>
          {!asking && <div><span>Order</span><span>{send} {ord.symbol} on {ord.chainName} → {ord.float && !paid ? 'about ' : ''}{got} XMR</span></div>}
          {paid && st?.repriced && <div><span>Note</span><span>Your deposit {st.repriced}, so it was paid at the rate of that moment.</span></div>}
          {st?.reason && !paid && s !== 'awaiting' && <div><span>Why</span><span>{st.reason}</span></div>}
          {st?.xmrTx && <div><span>Monero tx</span><button type="button" className="mono" title="Copy" style={plain} onClick={() => copy('tx', st.xmrTx!)}>{copied === 'tx' ? 'Copied' : st.xmrTx}<span className="sr-only">, copy</span></button></div>}
          {st?.txKey && <div><span>Tx key (proof)</span><button type="button" className="mono" title="Copy" style={plain} onClick={() => copy('key', st.txKey!)}>{copied === 'key' ? 'Copied' : st.txKey}<span className="sr-only">, copy</span></button></div>}
        </div>
        <p className="hint">{paid ? 'Open your Monero wallet: the payment shows within a minute or two. The proof is only shown to this browser.' : s === 'held' || s === 'stuck' ? 'Nothing is lost and nothing more is sent until a person has checked it. Keep this page link and message us with it.' : 'Keep this page or its link. It follows your deposit from one chain to the other.'}</p>
        {st?.txKey && <ProofGuide />}
        <OrderHelp kind="x" status={stage === 'refunded' && !['paid', 'held', 'stuck', 'resolved'].includes(s) ? 'refunded' : s} />
        <OrderLink kind="x" id={ord.address} />
        <OrderAlert known={!!st?.status} outcome={paid ? 'paid' : stage === 'refunded' ? 'refunded' : null} />
        {paid && <ShareExit kind="x" />}
        {over && <button className="btn btn-block" onClick={() => { setOrd(null); setSt(null); setRoute(null); window.history.replaceState(null, '', '/swap?tab=private') }}>New order</button>}
      </>
    )
  }

  const open = asset?.float ? !!info?.floatOpen : !!info?.open
  const ready = open && asset && raw && raw > 0n && est && check?.ok && refundCheck?.ok && !busy
  return (
    <>
      {elsewhere && <div className="note" role="status">{ELSEWHERE}</div>}
      <div className="field">
        <div className="field-top"><span>You send</span><span className="faint">From any wallet or exchange</span></div>
        <div className="box">
          <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))} aria-label="Amount to send" autoComplete="off" />
          <div className="rel" ref={menu}>
            <button type="button" className="asset" onClick={() => setPick((p) => !p)} aria-haspopup="listbox" aria-expanded={pick}>
              {asset ? <>{asset.symbol}<span className="faint" style={{ fontSize: 12 }}>{asset.chainName}</span></> : '…'}<span className="faint">▾</span>
            </button>
            {pick && (
              <div className="asset-menu" role="listbox" aria-label="Asset and network">
                {assets.map((a) => (
                  <button key={a.id} type="button" role="option" aria-selected={a.id === asset?.id} onClick={() => { setAssetId(a.id); setPick(false); setRefund('') }}>
                    <span>{a.symbol}</span><span className="faint" style={{ fontSize: 12.5 }}>on {a.chainName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {sendUsd && <span className="hint num">{sendUsd}</span>}
      </div>
      <div className="arrow" aria-hidden>↓</div>
      <div className="field">
        <div className="field-top"><span>{asset?.float ? `You receive (about: set when your ${asset.symbol} arrives)` : 'You receive (rate held while the timer runs)'}</span><span>Monero network</span></div>
        <div className="box">
          <div className="out" aria-live="polite" aria-atomic>{est ? `${asset?.float ? '≈ ' : ''}${xmr(est.xmrOut, asset?.float ? 4 : 5)}` : <span className="faint">0.00</span>}</div>
          <span className="asset static"><span className="dot"><img src="/img/xmr.webp" alt="" /></span>XMR</span>
        </div>
        {eErr && <span className="hint bad">{eErr}</span>}
      </div>
      <div className="field">
        <div className="field-top"><span>Your Monero address</span>{check?.ok && <span className="xmr">Sealed before it leaves this page</span>}</div>
        <div className={`box${check && !check.ok ? ' bad' : ''}`}>
          <textarea rows={3} spellCheck={false} placeholder="Starts with 8 or 4. A fresh subaddress is best." value={addr} onChange={(e) => setAddr(e.target.value.replace(/\s/g, ''))} aria-label="Your Monero address" aria-invalid={!!check && !check.ok} aria-describedby={check && !check.ok ? 'px-addr-err' : undefined} autoComplete="off" autoCapitalize="off" autoCorrect="off" />
        </div>
        {check && !check.ok && <span className="hint bad" id="px-addr-err">{check.reason}</span>}
      </div>
      <div className="field">
        <div className="field-top"><span>{asset?.chainName || 'Network'} refund address</span><span className="faint">Only used if the route can&apos;t complete</span></div>
        <div className={`box${refundCheck && !refundCheck.ok ? ' bad' : ''}`}>
          <input style={{ fontSize: 14, fontFamily: 'var(--mono)' }} spellCheck={false} placeholder={`A wallet you control on ${asset?.chainName || 'that network'}`} value={refund} onChange={(e) => setRefund(e.target.value.replace(/\s/g, ''))} aria-label="Refund address on the network you send from" aria-invalid={!!refundCheck && !refundCheck.ok} aria-describedby={refundCheck && !refundCheck.ok ? 'px-refund-err' : undefined} autoComplete="off" autoCapitalize="off" autoCorrect="off" />
        </div>
        {refundCheck && !refundCheck.ok && <span className="hint bad" id="px-refund-err">{refundCheck.reason}</span>}
      </div>
      {est && asset && (
        <div className="facts">
          <div><span>Fee</span><span className="num">{est.feeBps / 100}% ours, plus the route&apos;s own cost. Both are already in the amount</span></div>
          <div><span>Time</span><span>About {about(est.seconds)} after your deposit {asset.float ? 'has its confirmations' : 'confirms'} on {asset.chainName}</span></div>
          {info?.maxPico && <div><span>Per order</span><span className="num">Up to {xmr(info.maxPico, 2)} XMR for now</span></div>}
          {asset.float ? (
            <>
              <div><span>Rate</span><span>Set at the moment your funds reach Solana. Nothing is locked, because {asset.chainName} is too slow to promise a time</span></div>
              <div><span>Time to send</span><span>A little under three hours from when you create the order</span></div>
            </>
          ) : (
            <>
              <div><span>Timer</span><span>About 13 minutes to send. Sent in time, you get exactly this amount</span></div>
              <div><span>If it arrives late</span><span>It is paid at the rate of that moment, not refunded on Solana</span></div>
            </>
          )}
          <div><span>Still public</span><span>Your transfer on {asset.chainName} and the SOL that reaches Nero. Not where the XMR went.</span></div>
        </div>
      )}
      {err && <div className="note bad" role="alert">{err}</div>}
      <button className="btn btn-primary btn-lg btn-block" disabled={!ready} onClick={create}>
        {busy || (!open ? (asset?.float ? `Exits from ${asset.chainName} open soon` : 'Exits from other chains open soon') : !raw ? 'Enter an amount' : !check?.ok ? 'Add your Monero address' : !refundCheck?.ok ? 'Add a refund address' : !est ? (eErr ? 'No estimate' : 'Getting an estimate…') : 'Get deposit address')}
      </button>
      <p className="hint" style={{ textAlign: 'center', margin: 0 }}>No wallet connection. No signature on this site.</p>
    </>
  )
}
