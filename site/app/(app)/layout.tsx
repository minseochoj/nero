import Providers from '@/components/Providers'
import NavWallet from '@/components/NavWallet'

// Only the pages that talk to a wallet (swap) load the wallet code; the rest of the site stays light.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      {children}
      <NavWallet />
    </Providers>
  )
}
