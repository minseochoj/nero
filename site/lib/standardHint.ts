// When the private exit cannot take an order, the form offers the standard exit in its place.
// One place decides when, and what the note above the button says. No check depends on this.

export type StandardWhy = 'paused' | 'limit' | 'prices'

/** Why the standard exit is offered, or null when the private exit can take the order. */
export function standardWhy(enabled: boolean | null, quoteError: string): StandardWhy | null {
  if (enabled === false) return 'paused'
  if (/maximum|Not enough XMR|limit|not open/i.test(quoteError)) return 'limit'
  // the solver stops quoting while the pool's price is far from the outside price
  if (/moving fast/i.test(quoteError)) return 'prices'
  return null
}

/** The note shown above the "Use the standard exit" button. */
export const STANDARD_NOTE: Record<StandardWhy, string> = {
  paused: 'The private exit is paused right now. The standard exit has no such limit.',
  limit: 'This one is more than the private exit can cover right now. The standard exit has no such limit.',
  // the standard exit swaps at the pool's own price, which is the price the solver just refused: say so
  prices: 'The private exit waits while prices settle, usually a few minutes. The standard exit still works, at the market’s price right now, which may be lower than usual: check its quote before you sign.',
}
