import type { HelpAnchor } from './helpAnchors'
import type { OrderKind } from './orderLink'

// The Help answer a private order page links when an order did not end in a payment. `status` is the solver's
// word for the order; an other-assets page passes 'refunded' when its route returned the deposit on the origin chain.
// A state with no answer of its own (waiting, paying, paid, expired…) links nothing.
const ANSWER: Record<OrderKind, Record<string, HelpAnchor>> = {
  wallet: { refunded: 'refunded', stuck: 'checked-by-hand', held: 'no-order' },
  send: { refunded: 'refunded', stuck: 'checked-by-hand' },
  x: { refunded: 'late-deposit', stuck: 'checked-by-hand', held: 'checked-by-hand', resolved: 'checked-by-hand' },
}

// What the link says, per answer.
export const HELP_LINE: Partial<Record<HelpAnchor, string>> = {
  refunded: 'Why an order is refunded',
  'checked-by-hand': 'What “Being checked by hand” means',
  'no-order': 'What happens to funds sent without an order',
  'late-deposit': 'Why a deposit from another chain is returned',
}

export function orderHelp(kind: OrderKind, status: string | null | undefined): HelpAnchor | null {
  const m = ANSWER[kind]
  return (m && typeof status === 'string' && Object.hasOwn(m, status) && m[status]) || null
}
