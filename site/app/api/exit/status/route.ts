/*
  GET /api/exit/status?w=<withdrawal PDA>
  The bridge closes a withdrawal record when it completes or reverts, so an
  open record means pending/sending, and a closed one is resolved from the
  bridge's own events in the record's transactions.
*/
import { PublicKey } from '@solana/web3.js'
import { decodeWithdrawal, eventsFromLogs } from '@/lib/bridge'
import { CANCEL_DELAY_S } from '@/lib/constants'
import { serverConnection } from '@/lib/server/rpc'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const big = (v: bigint) => v.toString()

export async function GET(req: Request) {
  let w: PublicKey
  try { w = new PublicKey(new URL(req.url).searchParams.get('w') || '') } catch { return Response.json({ error: 'bad withdrawal' }, { status: 400 }) }
  const conn = serverConnection()
  try {
    const info = await conn.getAccountInfo(w)
    if (info) {
      const d = decodeWithdrawal(info.data)
      const age = Math.floor(Date.now() / 1000) - d.createdAt
      return Response.json({
        state: d.status, amount: big(d.amount), fee: big(d.fee), user: d.user, nonce: big(d.nonce), createdAt: d.createdAt,
        cancellable: d.status === 'pending' && age >= CANCEL_DELAY_S,
      }, { headers: { 'cache-control': 'no-store' } })
    }
    const sigs = await conn.getSignaturesForAddress(w, { limit: 10 })
    if (!sigs.length) return Response.json({ state: 'unknown' }, { headers: { 'cache-control': 'no-store' } })
    let requested: any = null
    let cancelled: string | null = null
    for (const s of sigs) {
      if (s.err) continue
      const tx = await conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' })
      if (!tx) continue
      if ((tx.meta?.logMessages || []).some((l) => /Instruction: CancelWithdrawal/.test(l))) cancelled = s.signature
      for (const e of eventsFromLogs(tx?.meta?.logMessages)) {
        if (e.withdrawal !== w.toBase58()) continue
        if (e.kind === 'completed') {
          return Response.json({ state: 'completed', amount: big(e.amount), xmrTxHash: e.xmrTxHash, xmrTxKey: e.xmrTxKey, xmrAddress: e.xmrAddress, solanaTx: s.signature, at: s.blockTime }, { headers: { 'cache-control': 'no-store' } })
        }
        if (e.kind === 'reverted') {
          return Response.json({ state: 'reverted', amount: big(e.amount), reason: e.reason, solanaTx: s.signature, at: s.blockTime }, { headers: { 'cache-control': 'no-store' } })
        }
        if (e.kind === 'requested') requested = { amount: big(e.amount), fee: big(e.fee), solanaTx: s.signature }
      }
    }
    // closed: only call it cancelled when the cancel instruction is actually visible; otherwise keep looking
    if (cancelled) return Response.json({ state: 'cancelled', ...(requested || {}), solanaTx: cancelled }, { headers: { 'cache-control': 'no-store' } })
    return Response.json({ state: requested ? 'sending' : 'unknown', ...(requested || {}) }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return Response.json({ error: 'status unavailable' }, { status: 502 })
  }
}
