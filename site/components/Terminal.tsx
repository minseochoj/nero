'use client'

import { useEffect, useState } from 'react'
import type { Tok } from './TokenPicker'
import Enter from './Enter'
import Exit from './Exit'
import PrivateExit from './PrivateExit'
import History from './History'
import SwapSide from './SwapSide'
import { rowKeys } from '@/lib/a11y'
import { sideView } from '@/lib/swapSide'

const TABS = [['private', 'Private exit', 'Solana → XMR'], ['exit', 'Standard exit', 'Via the bridge'], ['enter', 'Enter', 'XMR → Solana']] as const
type Tab = (typeof TABS)[number][0]

export default function Terminal() {
  const [tab, setTab] = useState<Tab>('private')
  const [mode, setMode] = useState<'wallet' | 'send' | 'x'>('wallet') // how the private exit is being sent; the side text follows it
  const [carry, setCarry] = useState<{ tok?: Tok; amount?: string; addr?: string } | undefined>()
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t === 'enter' || t === 'private' || t === 'exit') setTab(t)
    else if (new URLSearchParams(window.location.search).get('w')) setTab('exit') // a standard-exit tracking link
  }, [])
  return (
    <>
    <div>
    <div className="panel">
      <div className="tabs" role="tablist" aria-label="What to do" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }} onKeyDown={rowKeys(TABS.map((t) => t[0]), tab, setTab, 'tab')}>
        {TABS.map(([id, a, b]) => (
          <button key={id} type="button" role="tab" id={`swap-tab-${id}`} aria-controls="swap-panel" aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}><b>{a}</b><span>{b}</span></button>
        ))}
      </div>
      <div role="tabpanel" id="swap-panel" aria-labelledby={`swap-tab-${tab}`}>
        {tab === 'exit' ? <Exit key={carry ? 'carried' : 'plain'} initial={carry} /> : tab === 'private' ? <PrivateExit onMode={setMode} onStandard={(v) => { setCarry(v); setTab('exit') }} /> : <Enter />}
      </div>
    </div>
    <History />
    </div>
    <SwapSide view={sideView(tab, mode)} />
    </>
  )
}
