import { ogCard, OG_SIZE, OG_TYPE } from '@/lib/og'

export const size = OG_SIZE
export const contentType = OG_TYPE
export const alt = 'Nero status'

export default function OG() {
  return ogCard({ kicker: 'Nero · Status', title: 'Is it working?', sub: 'Live state of every route, the solver reserve and our Monero node.' })
}
