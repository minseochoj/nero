'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import ConnectButton from './ConnectButton'

/** The header's wallet button. The header lives outside the wallet provider, so the button is placed into its slot from here. */
export default function NavWallet() {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useEffect(() => { setSlot(document.getElementById('nav-wallet')) }, [])
  return slot ? createPortal(<ConnectButton size="sm" />, slot) : null
}
