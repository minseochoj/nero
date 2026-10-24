// The link back to one private order. It carries the order's public id and nothing else: `o` is the Solana
// transaction of a wallet order, `d` and `x` are the one-time deposit address of a no-wallet or other-assets order.
// The order's secret (which unlocks the payment proof) and the Monero address are never part of it; they stay in
// the browser that made the order, so the link opened anywhere else shows the empty form.
export type OrderKind = 'wallet' | 'send' | 'x'

const PARAM: Record<OrderKind, 'o' | 'd' | 'x'> = { wallet: 'o', send: 'd', x: 'x' }
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/
// a Solana signature is 64 bytes (86 to 88 characters), an address 32 bytes (32 to 44)
const LENGTH: Record<OrderKind, [number, number]> = { wallet: [86, 88], send: [32, 44], x: [32, 44] }

/** Whether `id` has the shape of an order id of this kind (a Solana transaction, or a one-time address). */
export function isOrderId(kind: OrderKind, id: string | null | undefined): boolean {
  const [min, max] = LENGTH[kind] || [0, 0]
  return !!PARAM[kind] && typeof id === 'string' && BASE58.test(id) && id.length >= min && id.length <= max
}

export function orderLink(base: string, kind: OrderKind, id: string): string {
  if (!isOrderId(kind, id)) throw new Error('not an order id')
  return `${base.replace(/\/$/, '')}/swap?tab=private&${PARAM[kind]}=${id}`
}

// What the line under the button says the link holds.
export const LINK_HOLDS: Record<OrderKind, string> = {
  wallet: 'your Solana transaction id',
  send: 'the one-time deposit address',
  x: 'the one-time address of this order',
}

// Shown above the empty form when the page was opened with an order link this browser has no order for.
export const ELSEWHERE = "This browser holds no record of this order: it was made in another browser, or this one's saved data was cleared. Its status and payment proof are only shown in the browser that made it."

/** True when a link names an order (a well-formed id) that is not among the orders kept in this browser. */
export function madeElsewhere(kind: OrderKind, id: string | null | undefined, knownIds: string[]): boolean {
  return isOrderId(kind, id) && !knownIds.includes(id as string)
}

// Where a paid order page sends people who want to check the payment themselves (the slug is a guide in `lib/guides.tsx`).
export const PROOF_GUIDE = '/guides/check-payment-proof'
