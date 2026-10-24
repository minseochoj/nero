import { pageMeta } from '@/lib/meta'
import Status from '@/components/Status'

export const metadata = pageMeta('Status', 'Live state of the private exit, the standard exit, the solver reserve and our Monero node.', '/status')

export default function StatusPage() {
  return (
    <div className="wrap" style={{ paddingBottom: 96 }}>
      <Status />
    </div>
  )
}
