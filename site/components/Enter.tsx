'use client'

import { useCallback, useEffect, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Transaction } from '@solana/web3.js'
import QRCode from 'qrcode'
import ConnectButton from './ConnectButton'
import { claimPendingMintIx, createAtaIdempotentIx, createDepositAccountIx } from '@/lib/bridge'
import { WXMR_MINT } from '@/lib/constants'
import { xmr } from '@/lib/format'

type State = { account: null | { address: string | null; status: string; totalDeposited: string }; wxmr: string; pending: string }

export default function Enter() {
  const { connection } = useConnection()
  const { publicKey, sendTransaction, connected } = useWallet()
  const [st, setSt] = useState<State | null>(null)
  const [qr, setQr] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    if (!publicKey) return
    try {
      const r = await fetch(`/api/enter?owner=${publicKey.toBase58()}`)
      if (r.ok) setSt(await r.json())
    } catch {}
  }, [publicKey])

  useEffect(() => {
    setSt(null)
    if (!publicKey) return
    load()
    const t = setInterval(load, 6000)
    return () => clearInterval(t)
  }, [publicKey, load])

  const address = st?.account?.address || ''
  useEffect(() => {
    if (!address) { setQr(''); return }
    QRCode.toDataURL(`monero:${address}`, { margin: 0, width: 264, color: { dark: '#0b0b0c', light: '#ffffff' } }).then(setQr).catch(() => setQr(''))
  }, [address])

  async function send(tx: Transaction, label: string) {
    if (!publicKey) return
    setErr('')
    setBusy(label)
    try {
      const sig = await sendTransaction(tx, connection)
      await connection.confirmTransaction(sig, 'confirmed').catch(() => null)
      await load()
    } catch (e: any) {
      const m = String(e?.message || e)
      setErr(/reject|declin|cancel/i.test(m) ? 'You cancelled in your wallet.' : 'The transaction did not go through. Try again.')
    } finally {
      setBusy('')
    }
  }

  const open = () => publicKey && send(new Transaction().add(createAtaIdempotentIx(publicKey, publicKey), createDepositAccountIx(publicKey)), 'Opening your deposit account…')
  const claim = () => publicKey && send(new Transaction().add(createAtaIdempotentIx(publicKey, publicKey), claimPendingMintIx(publicKey)), 'Claiming…')

  if (!connected || !publicKey) {
    return (
      <div className="panel-body">
        <p className="muted" style={{ margin: '4px 0' }}>Connect the Solana wallet that should receive wXMR. The bridge gives that wallet its own Monero deposit address.</p>
        <ConnectButton block size="lg" />
      </div>
    )
  }

  return (
    <div className="panel-body">
      {!st ? (
        <p className="muted">Reading your bridge account…</p>
      ) : !st.account ? (
        <>
          <div className="field">
            <div className="field-top"><span>Your Monero deposit address</span></div>
            <p className="muted" style={{ margin: 0 }}>None yet. Opening one is a single transaction (about 0.003 SOL of account rent). The bridge then assigns your wallet a Monero subaddress, usually within a minute.</p>
          </div>
          {err && <div className="note bad" role="alert">{err}</div>}
          <button className="btn btn-primary btn-lg btn-block" disabled={!!busy} onClick={open}>{busy || 'Get my Monero deposit address'}</button>
        </>
      ) : !address ? (
        <div className="track-steps">
          <div className="done">Deposit account opened</div>
          <div className="now">Waiting for the bridge to assign your address<small>Usually under a minute. This page checks every few seconds.</small></div>
        </div>
      ) : (
        <>
          <div className="field">
            <div className="field-top"><span>Send XMR to</span><span className="xmr">Only for this wallet</span></div>
            <div className="qr">
              {qr && <img src={qr} alt="QR code of your Monero deposit address" />}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                <span className="addr">{address}</span>
                <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => { navigator.clipboard?.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? 'Copied' : 'Copy address'}</button>
              </div>
            </div>
          </div>
          <div className="facts">
            <div><span>Minimum per deposit</span><span>0.1 XMR</span></div>
            <div><span>Bridge fee in</span><span>0%</span></div>
            <div><span>Arrives as</span><span>wXMR in this wallet, after Monero confirmations (~20 min)</span></div>
            <div><span>Minted to you so far</span><span className="num">{xmr(st.account.totalDeposited, 4)} XMR</span></div>
            <div><span>wXMR in your wallet</span><span className="num">{xmr(st.wxmr, 4)}</span></div>
          </div>
          {BigInt(st.pending || '0') > 0n && (
            <div className="note warn">
              {xmr(st.pending, 4)} wXMR is waiting in your deposit account.{' '}
              <button className="btn btn-sm" disabled={!!busy} onClick={claim}>{busy || 'Claim to wallet'}</button>
            </div>
          )}
          {err && <div className="note bad" role="alert">{err}</div>}
          <a className="btn btn-block" href={`https://jup.ag/swap/${WXMR_MINT.toBase58()}-SOL`} target="_blank" rel="noreferrer">Swap wXMR for SOL ↗</a>
          <p className="hint" style={{ margin: 0 }}>This address is recorded on Solana next to your wallet. Anyone can see that this wallet deposits from Monero, not where the XMR came from.</p>
        </>
      )}
    </div>
  )
}
