/*
  Relay to the solver (path /v2/*). Only these pass:
  GET info, quote, order, estimate, stats, node · POST check, address. The Monero address arrives here already sealed in the browser, and the
  browser builds the transaction itself: nothing here hands out a transaction to sign.
*/
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ENGINE = process.env.SOLVER_URL || ''

async function relay(path: string, search: string, init: RequestInit = {}, ip = '') {
  if (!ENGINE) return Response.json({ error: 'solver not connected yet' }, { status: 503 })
  try {
    const r = await fetch(`${ENGINE}/v2/${path}${search}`, { ...init, headers: { ...(init.headers || {}), 'x-real-ip': ip }, cache: 'no-store', signal: AbortSignal.timeout(20_000) })
    return new Response(await r.text(), { status: r.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
  } catch {
    return Response.json({ error: 'solver unreachable' }, { status: 502 })
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join('/')
  if (!['info', 'quote', 'order', 'estimate', 'stats', 'node'].includes(path)) return Response.json({ error: 'not found' }, { status: 404 })
  return relay(path, new URL(req.url).search, {}, (req.headers.get('x-forwarded-for') || '').split(',')[0].trim())
}

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join('/')
  if (path !== 'check' && path !== 'address') return Response.json({ error: 'not found' }, { status: 404 })
  const body = await req.text()
  if (body.length > 4000) return Response.json({ error: 'too large' }, { status: 413 })
  if (path === 'address' && /"via"\s*:/.test(body)) return Response.json({ error: 'not found' }, { status: 404 })
  return relay(path, '', { method: 'POST', headers: { 'content-type': 'application/json' }, body }, (req.headers.get('x-forwarded-for') || '').split(',')[0].trim())
}
