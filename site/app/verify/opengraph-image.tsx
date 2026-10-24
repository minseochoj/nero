import { ogCard, OG_SIZE, OG_TYPE } from '@/lib/og'

export const size = OG_SIZE
export const contentType = OG_TYPE
export const alt = 'Verify Nero'

export default function OG() {
  return ogCard({ kicker: 'Nero · Verify', title: 'Check it yourself.', sub: 'The code, the keys, our own Monero node and every signed promise.' })
}
