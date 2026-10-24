// The fixed name of each answer on /help, in page order. A name is part of the page's address
// (/help#refunded), so other pages can link one answer: never rename one, only add.
export const HELP_ANCHORS = [
  'which-exit',
  'what-is-public',
  'cost',
  'stablecoins-no-wallet',
  'other-chains',
  'late-deposit',
  'no-wallet',
  'how-long',
  'refunded',
  'wrong-amount',
  'checked-by-hand',
  'no-order',
  'proof',
  'check-proof',
  'down',
  'wallet-warning',
  'monero-wallet',
  'verify',
  'dm',
] as const

export type HelpAnchor = (typeof HELP_ANCHORS)[number]

export const helpLink = (a: HelpAnchor) => `/help#${a}`
