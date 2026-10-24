'use client'

import { useMemo } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { BRAND } from '@/lib/brand'

/*
  No adapter list: Phantom, Solflare, Backpack and every wallet-standard wallet
  register themselves. The Connection points at /api/rpc so the keyed RPC
  never reaches the browser.
*/
export default function Providers({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => (typeof window === 'undefined' ? 'http://localhost/api/rpc' : `${window.location.origin}/api/rpc`), [])
  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: 'confirmed' }}>
      <WalletProvider wallets={[]} autoConnect localStorageKey={BRAND.walletKey}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  )
}
