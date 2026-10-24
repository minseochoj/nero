import { pageMeta } from '@/lib/meta'
import Terminal from '@/components/Terminal'

export const metadata = pageMeta('Swap', 'Any Solana token to real Monero at your own address, in one signature. Your Monero address never appears on Solana.', '/swap')

export default function SwapPage() {
  return (
    <div className="wrap term-page">
      <Terminal />
    </div>
  )
}
