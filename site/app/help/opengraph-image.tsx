import { ogCard, OG_SIZE, OG_TYPE } from '@/lib/og'

export const size = OG_SIZE
export const contentType = OG_TYPE
export const alt = 'Nero help'

export default function OG() {
  return ogCard({ kicker: 'Nero · Help', title: 'Questions, answered.', sub: 'Exits, payment proofs, refunds and checks in plain words.' })
}
