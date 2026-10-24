import { ogCard, OG_SIZE, OG_TYPE } from '@/lib/og'

export const size = OG_SIZE
export const contentType = OG_TYPE
export const alt = 'Nero guides'

export default function OG() {
  return ogCard({ kicker: 'Nero · Guides', title: 'Step by step.', sub: 'SOL, USDC and pump.fun coins into real Monero.' })
}
