import { ogCard, OG_SIZE, OG_TYPE } from '@/lib/og'

export const size = OG_SIZE
export const contentType = OG_TYPE
export const alt = 'Nero: what is public'

export default function OG() {
  return ogCard({ kicker: 'Nero · What is public', title: 'What anyone can see.', sub: 'Route by route: what Solana shows, what Monero hides, what we know.' })
}
