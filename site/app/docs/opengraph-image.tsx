import { ogCard, OG_SIZE, OG_TYPE } from '@/lib/og'

export const size = OG_SIZE
export const contentType = OG_TYPE
export const alt = 'Nero paper'

export default function OG() {
  return ogCard({ kicker: 'Nero · Paper', title: 'How it works.', sub: 'How to verify it, what you trust, and where the limits are.' })
}
