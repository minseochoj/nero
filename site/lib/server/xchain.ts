/*
  Server side of exits from other chains: talks to the route provider (NEAR Intents 1Click) and to our solver.
  The provider is asked for an EXACT_OUTPUT route: it delivers exactly the SOL our solver's order is for, to the
  order's one-time address, and refunds anything else on the origin chain to the address the user gave.
  Nothing here holds funds or keys.
*/
import { X_ASSETS, type XAssetLive, type XKind } from '@/lib/xchain'

const API = process.env.XCHAIN_API || 'https://1click.chaindefuser.com/v0'
const JWT = process.env.XCHAIN_JWT || ''
const ENGINE = process.env.SOLVER_URL || ''
const SOL_ASSET = 'nep141:sol.omft.near'
const SLIPPAGE_BPS = 100
// the route is asked for this much more SOL than the order needs, so a fee taken on delivery cannot leave it a hair short
const ROUTE_MARGIN = 150_000n
// dry quotes need well-formed addresses; these receive nothing (a dry quote creates no deposit address)
const PLACEHOLDER_REFUND: Record<XKind, string> = {
  evm: '0x1111111111111111111111111111111111111111', tron: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  btc: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', zec: 't1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs', ltc: 'ltc1qg42tkwuuxefutzxezdkdel39gfstuap288mfea', doge: 'DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L', sol: 'BGoyuZjKWwajN9U5q5xgFcPB5CER6vpYoL1fpCyzKvvv',
}
const PLACEHOLDER_RECIPIENT = '5GDP6viv4mK1XE2RBtdLoz3ct65YFjq6yfFoqXBi7bbk'

const digits = (v: unknown): v is string => typeof v === 'string' && /^\d{1,40}$/.test(v)

export class XError extends Error { constructor(message: string, public status = 400) { super(message) } }

async function provider(path: string, init?: RequestInit) {
  let r: Response
  try {
    r = await fetch(`${API}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(JWT ? { authorization: `Bearer ${JWT}` } : {}) }, cache: 'no-store', signal: AbortSignal.timeout(20_000) })
  } catch { throw new XError('The route is not answering right now. Try again in a minute.', 502) }
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok) {
    const m = String(j?.message || '')
    if (/refundTo/i.test(m)) throw new XError('That refund address is not valid on this network. Check it and try again.')
    const min = m.match(/minimum swap amount is \$([\d,]+)/i)
    if (min) throw new XError(`This network needs at least $${min[1]} per exit right now. Try a larger amount or another network.`)
    if (/amount|too (low|small)|minimum|liquidity|no quote|solver/i.test(m)) throw new XError('No route for this amount right now. Try a larger amount or another asset.')
    throw new XError('The route could not quote this. Try again in a minute.', 502)
  }
  return j
}

export async function solver(path: string, init?: RequestInit & { ip?: string }) {
  if (!ENGINE) throw new XError('The solver is not connected yet', 503)
  let r: Response
  try {
    r = await fetch(`${ENGINE}/v2/${path}`, { ...init, headers: { 'content-type': 'application/json', 'x-real-ip': init?.ip || '' }, cache: 'no-store', signal: AbortSignal.timeout(20_000) })
  } catch { throw new XError('The solver is not answering right now. Try again in a minute.', 502) }
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok) throw new XError(j?.error || 'The solver refused this order', r.status)
  return j
}

let cache: { at: number; list: XAssetLive[] } = { at: 0, list: [] }
/** The assets we offer, with the provider's live decimals and price. Kept for five minutes. */
export async function liveAssets(): Promise<XAssetLive[]> {
  if (Date.now() - cache.at < 300_000 && cache.list.length) return cache.list
  const all: any[] = await provider('/tokens')
  const byId = new Map(all.map((t) => [t.assetId, t]))
  const list = X_ASSETS.flatMap((a) => {
    const t = byId.get(a.id)
    return t && Number.isInteger(t.decimals) && t.blockchain === a.chain ? [{ ...a, decimals: t.decimals as number, price: Number(t.price) || 0 }] : []
  })
  if (!byId.has(SOL_ASSET)) throw new XError('The route to Solana is not available right now.', 502)
  cache = { at: Date.now(), list }
  return list
}

type QuoteArgs = { dry: boolean; swapType: 'EXACT_INPUT' | 'EXACT_OUTPUT'; originAsset: string; amount: string; refundTo: string; recipient: string; deadline: string }
const quote = (a: QuoteArgs) => provider('/quote', {
  method: 'POST',
  body: JSON.stringify({ ...a, slippageTolerance: SLIPPAGE_BPS, depositType: 'ORIGIN_CHAIN', destinationAsset: SOL_ASSET, refundType: 'ORIGIN_CHAIN', recipientType: 'DESTINATION_CHAIN' }),
})
const iso = (unix: number) => new Date(unix * 1000).toISOString().replace(/\.\d+Z$/, 'Z')

/** How much SOL an amount of the asset is sure to deliver (after the route's own costs and slippage). No order is made. */
async function sureLamports(asset: XAssetLive, amount: string): Promise<{ lamports: bigint; seconds: number }> {
  const q = await quote({ dry: true, swapType: 'EXACT_INPUT', originAsset: asset.id, amount, refundTo: PLACEHOLDER_REFUND[asset.kind], recipient: PLACEHOLDER_RECIPIENT, deadline: iso(Math.floor(Date.now() / 1000) + 780) })
  if (!digits(q?.quote?.minAmountOut)) throw new XError('No route for this amount right now.')
  const lamports = BigInt(q.quote.minAmountOut)
  if (lamports <= 0n) throw new XError('No route for this amount right now.')
  return { lamports, seconds: Number(q.quote.timeEstimate) || 60 }
}

export async function estimate(assetId: string, amount: string) {
  const asset = (await liveAssets()).find((a) => a.id === assetId)
  if (!asset) throw new XError('That asset is not offered')
  if (!/^[1-9]\d{0,39}$/.test(amount)) throw new XError('bad amount')
  const { lamports, seconds } = await sureLamports(asset, amount)
  const e = await solver(`estimate?amount=${lamports}`)
  return { asset: asset.id, amount, lamports: lamports.toString(), xmrOut: String(e.xmrOut), feeBps: e.feeBps, seconds, ...(asset.float ? { float: true } : {}) }
}

/**
 * A slow chain (Bitcoin, Zcash, ...): no rate is locked. The person sends exactly the amount they typed; the route
 * delivers whatever SOL that buys to the order's one-time address, and the solver prices the XMR when it arrives.
 */
async function createFloatOrder(asset: XAssetLive, amount: string, sealed: string, secretHash: string, refundTo: string, ip: string) {
  const { lamports, seconds } = await sureLamports(asset, amount)
  const order = await solver('address', { method: 'POST', body: JSON.stringify({ amount: lamports.toString(), sealed, secretHash, via: 'x', float: true }), ip })
  if (order.float !== true || typeof order.address !== 'string' || !Number.isInteger(order.expiresAt)) throw new XError('The solver answered for a different order', 502)
  // the route stops swapping (and refunds on the origin chain) 15 minutes before our order stops expecting a deposit
  const want = order.expiresAt - 900
  const q = await quote({ dry: false, swapType: 'EXACT_INPUT', originAsset: asset.id, amount, refundTo, recipient: order.address, deadline: iso(want) })
  const got = q?.quote, asked = q?.quoteRequest
  const wrong = new XError('The route answered for a different order. Send nothing; try again.', 502)
  if (!got?.depositAddress || typeof got.depositAddress !== 'string' || got.depositMemo) throw new XError('The route gave no usable deposit address. Try again.', 502)
  if (asked?.recipient !== order.address || asked?.originAsset !== asset.id || asked?.destinationAsset !== SOL_ASSET || String(asked?.refundTo || '').toLowerCase() !== refundTo.toLowerCase()) throw wrong
  if (!digits(got.amountIn) || got.amountIn !== amount || !digits(got.minAmountOut) || BigInt(got.minAmountOut) <= 0n) throw wrong
  const deadline = Math.floor(Date.parse(String(asked?.deadline || '')) / 1000)
  if (!Number.isFinite(deadline) || Math.abs(deadline - want) > 5 || deadline < Math.floor(Date.now() / 1000) + 1800) throw wrong
  return {
    address: order.address, lamports: String(order.lamports), xmrOut: String(order.xmrOut), expiresAt: order.expiresAt as number, float: true as const,
    asset: asset.id, deposit: got.depositAddress as string, amountIn: amount, minAmountIn: amount, deadline, seconds: Number(got.timeEstimate) || seconds,
  }
}

export async function createOrder({ assetId, amount, sealed, secretHash, refundTo, ip }: { assetId: string; amount: string; sealed: string; secretHash: string; refundTo: string; ip: string }) {
  const asset = (await liveAssets()).find((a) => a.id === assetId)
  if (!asset) throw new XError('That asset is not offered')
  if (!/^[1-9]\d{0,39}$/.test(amount)) throw new XError('bad amount')
  if (asset.float) return createFloatOrder(asset, amount, sealed, secretHash, refundTo, ip)
  const { lamports } = await sureLamports(asset, amount)
  // the route must accept the refund address before the solver reserves any XMR for this order
  const ask = (lamports + ROUTE_MARGIN).toString()
  const check = await quote({ dry: true, swapType: 'EXACT_OUTPUT', originAsset: asset.id, amount: ask, refundTo, recipient: PLACEHOLDER_RECIPIENT, deadline: iso(Math.floor(Date.now() / 1000) + 780) })
  if (!digits(check?.quote?.amountIn) || BigInt(check.quote.amountIn) <= 0n) throw new XError('No route for this amount right now.')

  const order = await solver('address', { method: 'POST', body: JSON.stringify({ amount: lamports.toString(), sealed, secretHash, via: 'x' }), ip })
  if (BigInt(order.lamports) !== lamports || typeof order.address !== 'string') throw new XError('The solver answered for a different order', 502)

  // the route closes 90 seconds before our order does, so a late deposit is refunded on its own chain instead of arriving late
  const q = await quote({ dry: false, swapType: 'EXACT_OUTPUT', originAsset: asset.id, amount: ask, refundTo, recipient: order.address, deadline: iso(order.expiresAt - 90) })
  const got = q?.quote, asked = q?.quoteRequest
  if (!got?.depositAddress || typeof got.depositAddress !== 'string' || got.depositMemo) throw new XError('The route gave no usable deposit address. Try again.', 502)
  const wrong = new XError('The route answered for a different order. Send nothing; try again.', 502)
  if (asked?.recipient !== order.address || asked?.originAsset !== asset.id || asked?.destinationAsset !== SOL_ASSET || String(asked?.refundTo || '').toLowerCase() !== refundTo.toLowerCase()) throw wrong
  if (!digits(got.amountIn) || !digits(got.minAmountOut) || BigInt(got.minAmountOut) < BigInt(ask) || BigInt(got.amountIn) <= 0n) throw wrong
  // Our deadline is when the route stops swapping and starts refunding on the origin chain; it must be the one we asked
  // for (90 seconds before our order's window closes). The route's own `quote.deadline` is something else: how long the
  // deposit address stays watched so a late deposit can still be refunded (days), not how long the swap is open.
  const want = order.expiresAt - 90
  const deadline = Math.floor(Date.parse(String(asked?.deadline || '')) / 1000)
  if (!Number.isFinite(deadline) || Math.abs(deadline - want) > 5 || deadline < Math.floor(Date.now() / 1000) + 120) throw wrong
  return {
    address: order.address, lamports: order.lamports, xmrOut: String(order.xmrOut), expiresAt: order.expiresAt,
    asset: asset.id, deposit: got.depositAddress as string, amountIn: String(got.amountIn), minAmountIn: String(got.minAmountIn || got.amountIn),
    deadline, seconds: Number(got.timeEstimate) || 60,
  }
}

/** Where the route is with a deposit. Only the fields the page needs. */
export async function routeStatus(deposit: string) {
  if (!/^[0-9A-Za-z]{20,90}$/.test(deposit)) throw new XError('bad deposit address')
  let j: any
  try { j = await provider(`/status?depositAddress=${encodeURIComponent(deposit)}`) }
  catch { return { status: 'PENDING_DEPOSIT', originTxs: [] as string[], refundedAmount: null as string | null, unread: true } } // not answering: keep waiting, never guess an outcome
  const d = j?.swapDetails || {}
  const hashes = (a: any) => (Array.isArray(a) ? a.map((x) => String(x?.hash || '')).filter(Boolean).slice(0, 3) : [])
  return { status: String(j?.status || 'PENDING_DEPOSIT'), originTxs: hashes(d.originChainTxHashes), refundedAmount: d.refundedAmount ? String(d.refundedAmount) : null, unread: false }
}
