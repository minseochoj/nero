import { pageMeta } from '@/lib/meta'
import Verify from '@/components/Verify'

export const metadata = pageMeta('Verify', 'Check Nero yourself: the code it runs, the keys it uses, its own Monero node against a public one, and any signed order promise.', '/verify')

export default function VerifyPage() {
  return (
    <div className="wrap" style={{ paddingBottom: 96, maxWidth: 920 }}>
      <Verify />
    </div>
  )
}
