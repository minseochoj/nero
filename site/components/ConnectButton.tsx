'use client'

import { useEffect, useRef, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletReadyState } from '@solana/wallet-adapter-base'
import { short } from '@/lib/format'

export default function ConnectButton({ block = false, size = '' }: { block?: boolean; size?: '' | 'lg' | 'sm' }) {
  const { wallets, select, publicKey, connected, connecting, disconnect, wallet } = useWallet()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => setMounted(true), [])
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [open])
  // Escape closes the menu and puts focus back on its button; tabbing out of it closes it too
  const keys = {
    onKeyDown: (e: React.KeyboardEvent) => { if (open && e.key === 'Escape') { e.stopPropagation(); setOpen(false); btn.current?.focus() } },
    onBlur: (e: React.FocusEvent) => { if (open && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false) },
  }
  const cls = `btn${size ? ` btn-${size}` : ''}${block ? ' btn-block' : ''}`

  if (mounted && connected && publicKey) {
    const a = publicKey.toBase58()
    return (
      <div className="menu-wrap" ref={ref} style={block ? { width: '100%' } : undefined} {...keys}>
        <button ref={btn} type="button" className={cls} onClick={() => setOpen((o) => !o)} title={a} aria-expanded={open} aria-label={`Wallet ${short(a)}: options`}>
          <i className="wdot" aria-hidden />
          <span className="mono">{short(a)}</span>
        </button>
        {open && (
          <div className="menu">
            <div className="menu-head"><span className="mono">{short(a, 6)}</span><span>{wallet?.adapter.name}</span></div>
            <button className="menu-item" onClick={() => { navigator.clipboard?.writeText(a); setOpen(false) }}>Copy address</button>
            <button className="menu-item" onClick={() => { disconnect(); setOpen(false) }}>Disconnect</button>
          </div>
        )}
      </div>
    )
  }
  const found = wallets.filter((w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable)
  return (
    <div className="menu-wrap" ref={ref} style={block ? { width: '100%' } : undefined} {...keys}>
      <button ref={btn} type="button" className={`${cls} btn-primary`} disabled={connecting} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {connecting ? 'Connecting…' : 'Connect wallet'}
      </button>
      {open && (
        <div className="menu" style={block ? { left: 0, right: 'auto' } : undefined}>
          <div className="menu-head"><span>{found.length ? 'Detected wallets' : 'No Solana wallet found'}</span></div>
          {found.map((w) => (
            <button key={w.adapter.name} className="menu-item" onClick={() => { select(w.adapter.name); setOpen(false) }}>
              {w.adapter.icon && <img src={w.adapter.icon} alt="" width={18} height={18} />}
              {w.adapter.name}
            </button>
          ))}
          {found.length === 0 && (
            <>
              <a className="menu-item" href="https://phantom.com/download" target="_blank" rel="noreferrer">Get Phantom ↗</a>
              <a className="menu-item" href="https://solflare.com/download" target="_blank" rel="noreferrer">Get Solflare ↗</a>
            </>
          )}
        </div>
      )}
    </div>
  )
}
