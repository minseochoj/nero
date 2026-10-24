/*
  POST /api/rpc — JSON-RPC relay for the browser's wallet flows.
  Browsers cannot use the keyed RPC (it must never be NEXT_PUBLIC) and the public
  mainnet endpoint rejects browser traffic, so the wallet Connection talks to us.
  NOT an open relay: only the methods the exit / deposit flows emit are
  forwarded, batches are refused, bodies are capped and each IP is rate limited.
*/
import { RPC_URL } from '@/lib/server/rpc'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_BODY = 200_000
const RATE_MAX = 900
const WINDOW_MS = 10 * 60 * 1000

const ALLOWED = new Set([
  'getLatestBlockhash', 'getBlockHeight', 'getSlot', 'getSignatureStatuses', 'sendTransaction',
  'getAccountInfo', 'getMultipleAccounts', 'getMinimumBalanceForRentExemption', 'getFeeForMessage', 'getEpochInfo',
  'getVersion', 'getHealth', 'getBalance', 'getTokenAccountBalance', 'getRecentPrioritizationFees', 'getTokenAccountsByOwner',
])

const hits = new Map<string, { n: number; since: number }>()
function limited(ip: string) {
  const now = Date.now()
  const h = hits.get(ip)
  if (!h || now - h.since > WINDOW_MS) {
    if (hits.size > 5000) hits.clear()
    hits.set(ip, { n: 1, since: now })
    return false
  }
  h.n += 1
  return h.n > RATE_MAX
}

export async function POST(req: Request) {
  if (Number(req.headers.get('content-length') || 0) > MAX_BODY) return Response.json({ error: 'request too large' }, { status: 413 })
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local'
  if (limited(ip)) return Response.json({ error: 'rate limit exceeded' }, { status: 429 })
  let body: string
  let parsed: any
  try {
    body = await req.text()
    if (body.length > MAX_BODY) throw new Error('too large')
    parsed = JSON.parse(body)
  } catch {
    return Response.json({ error: 'expected a JSON-RPC body' }, { status: 400 })
  }
  if (Array.isArray(parsed)) return Response.json({ error: 'batch requests not supported' }, { status: 400 })
  if (typeof parsed?.method !== 'string' || !ALLOWED.has(parsed.method)) {
    return Response.json(
      { jsonrpc: '2.0', id: parsed?.id ?? null, error: { code: -32601, message: `method not allowed: ${String(parsed?.method).slice(0, 64)}` } },
      { status: 403 },
    )
  }
  try {
    const r = await fetch(RPC_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body, cache: 'no-store' })
    return new Response(await r.text(), { status: r.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
  } catch {
    return Response.json({ error: 'upstream unreachable' }, { status: 502 })
  }
}
