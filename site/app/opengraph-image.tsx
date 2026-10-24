import { ogCard, OG_SIZE, OG_TYPE } from '@/lib/og'

export const size = OG_SIZE
export const contentType = OG_TYPE
export const alt = 'Nero: one signature to Monero'

export default function OG() {
  return ogCard({ kicker: 'Nero', title: 'Solana in. Monero out.', sub: 'Any Solana token to real XMR, paid from our own Monero node.' })
}
