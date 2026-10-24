/*
  Exits from other chains.
  GET  /api/x/assets                       the assets offered, with live decimals and prices, and whether the route is open
  GET  /api/x/estimate?asset=&amount=      XMR for an amount (smallest units of the asset). Creates nothing.
  POST /api/x/order                        { asset, amount, sealed, secretHash, refundTo } -> where to send, how much, what you get
  GET  /api/x/status?deposit=              where the route is with a deposit
  The Monero address arrives here already sealed in the browser, for our solver only. The route provider never sees it.
*/
import { checkRefund, xAsset } from '@/lib/xchain'
import { XError, createOrder, estimate, liveAssets, routeStatus, solver } from '@/lib/server/xchain'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const hits = new Map<string, { n: number; since: number }>()
function limited(ip: string, max: number) {
  const now = Date.now(), h = hits.get(ip)
  if (!h || now - h.since > 60_000) { if (hits.size > 5000) hits.clear(); hits.set(ip, { n: 1, since: now }); return false }
  return ++h.n > max
}
const ipOf = (req: Request) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local'
const fail = (e: unknown) => (e instanceof XError ? Response.json({ error: e.message }, { status: e.status }) : Response.json({ error: 'Something went wrong. Try again.' }, { status: 500 }))
const json = (body: unknown, cache = 'no-store') => Response.json(body, { headers: { 'cache-control': cache } })

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join('/')
  const sp = new URL(req.url).searchParams
  try {
    if (path === 'assets') {
      const [info, assets] = await Promise.all([solver('info').catch(() => null), liveAssets()])
      return json({ open: !!info?.xchain, floatOpen: !!info?.xfloat, maxPico: info?.xMaxPico || null, minPico: info?.minPico || null, feeBps: info?.addrFeeBps || null, assets }, 'public, s-maxage=30, stale-while-revalidate=120')
    }
    if (limited(ipOf(req), 40)) return Response.json({ error: 'Too many requests. Wait a moment.' }, { status: 429 })
    if (path === 'estimate') return json(await estimate(sp.get('asset') || '', sp.get('amount') || ''))
    if (path === 'status') return json(await routeStatus(sp.get('deposit') || ''))
    return Response.json({ error: 'not found' }, { status: 404 })
  } catch (e) { return fail(e) }
}

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if ((await params).path.join('/') !== 'order') return Response.json({ error: 'not found' }, { status: 404 })
  const ip = ipOf(req)
  if (limited(ip, 40)) return Response.json({ error: 'Too many requests. Wait a moment.' }, { status: 429 })
  try {
    const text = await req.text()
    if (text.length > 4000) return Response.json({ error: 'too large' }, { status: 413 })
    const b = JSON.parse(text)
    const asset = xAsset(String(b.asset || ''))
    if (!asset) throw new XError('That asset is not offered')
    const refund = checkRefund(asset.kind, String(b.refundTo || ''))
    if (!refund.ok) throw new XError(refund.reason)
    if (typeof b.sealed !== 'string' || typeof b.secretHash !== 'string') throw new XError('bad order')
    return json(await createOrder({ assetId: asset.id, amount: String(b.amount || ''), sealed: b.sealed, secretHash: b.secretHash, refundTo: refund.value, ip }))
  } catch (e) { return fail(e instanceof SyntaxError ? new XError('bad order') : e) }
}
