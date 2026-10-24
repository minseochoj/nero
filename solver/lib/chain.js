// Chain access with timeouts everywhere and a fail-closed send.
import { readFileSync } from 'fs'
import bs58 from 'bs58'
import {
  ComputeBudgetProgram, Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction,
} from '@solana/web3.js'

const timedFetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) })

export function connect(url) {
  return new Connection(url, { commitment: 'confirmed', fetch: timedFetch, disableRetryOnRateLimit: false })
}

export function loadKeypair(path) {
  const raw = readFileSync(path, 'utf8').trim()
  return Keypair.fromSecretKey(raw.startsWith('[') ? Uint8Array.from(JSON.parse(raw)) : bs58.decode(raw))
}

export async function buildTx(conn, payer, ixs, signers, { units = 300_000, microLamports = 100_000, alts = [] } = {}) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed')
  const msg = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports }), ...ixs],
  }).compileToV0Message(alts)
  const tx = new VersionedTransaction(msg)
  tx.sign(signers)
  return { tx, lastValidBlockHeight, sig: bs58.encode(tx.signatures[0]) }
}

export async function simulate(conn, tx) {
  const r = await conn.simulateTransaction(tx, { sigVerify: false, commitment: 'confirmed' })
  return { ok: !r.value.err, err: r.value.err, logs: r.value.logs || [], units: r.value.unitsConsumed }
}

// overridable so tests can run the timing logic instantly
export const timing = { sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: () => Date.now() }
const sleep = (ms) => timing.sleep(ms)

/**
 * Positive proof that a signature never landed and never can:
 *   - the FINALIZED block height is well past the transaction's lastValidBlockHeight, and
 *   - two checks a few seconds apart (status with full history + finalized getTransaction) find nothing.
 * Any RPC error, or anything seen at all, returns 'unknown'. Returns 'absent' | 'landed' | 'failed' | 'unknown'.
 */
export async function provenAbsent(conn, sig, lastValidBlockHeight, { gapMs = 5000 } = {}) {
  try {
    const st0 = (await conn.getSignatureStatuses([sig], { searchTransactionHistory: true })).value[0]
    if (st0) {
      if (st0.confirmationStatus === 'confirmed' || st0.confirmationStatus === 'finalized') return st0.err ? 'failed' : 'landed'
      return 'unknown'
    }
    if (!(lastValidBlockHeight > 0)) return 'unknown'
    const fin = await conn.getBlockHeight('finalized')
    if (fin <= lastValidBlockHeight + 150) return 'unknown'
    for (let i = 0; i < 2; i++) {
      if (i) await sleep(gapMs)
      const st = (await conn.getSignatureStatuses([sig], { searchTransactionHistory: true })).value[0]
      if (st) return 'unknown'
      const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: 'finalized' })
      if (tx) return tx.meta?.err ? 'failed' : 'landed'
    }
    return 'absent'
  } catch {
    return 'unknown'
  }
}

/**
 * Send ONE signed transaction and classify the outcome. The same bytes are re-broadcast
 * until they confirm or their blockhash expires; nothing is ever rebuilt here.
 *   confirmed   landed without error
 *   failed      landed with an error (nothing moved but the fee)
 *   not_landed  provenAbsent: safe to rebuild
 *   ambiguous   could not prove either: quarantine, never resend automatically
 */
export async function sendSafe(conn, { tx, lastValidBlockHeight, sig }, { timeoutMs = 150_000 } = {}) {
  const raw = tx.serialize()
  const started = timing.now()
  let lastBroadcast = 0
  let rpcErrors = 0
  while (timing.now() - started < timeoutMs) {
    if (timing.now() - lastBroadcast > 4000) {
      lastBroadcast = timing.now()
      await conn.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }).catch(() => { rpcErrors++ })
    }
    await sleep(2000)
    try {
      const st = (await conn.getSignatureStatuses([sig], { searchTransactionHistory: true })).value[0]
      if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) {
        return st.err ? { status: 'failed', sig, err: st.err } : { status: 'confirmed', sig }
      }
      const height = await conn.getBlockHeight('confirmed')
      if (height > lastValidBlockHeight + 5) break // expired: stop re-broadcasting, then prove it
    } catch {
      rpcErrors++
    }
  }
  // wait for finality to pass expiry (~1 min), then demand positive proof of absence
  for (let i = 0; i < 12; i++) {
    const r = await provenAbsent(conn, sig, lastValidBlockHeight)
    if (r === 'landed') return { status: 'confirmed', sig }
    if (r === 'failed') return { status: 'failed', sig }
    if (r === 'absent') return { status: 'not_landed', sig }
    await sleep(10_000)
  }
  return { status: 'ambiguous', sig, detail: `could not prove the outcome (${rpcErrors} rpc errors)` }
}

/** Raw token balance; 0 only when three reads in a row agree the account does not exist. Throws otherwise. */
export async function tokenBalance(conn, account) {
  for (let i = 0; i < 3; i++) {
    const info = await conn.getAccountInfo(account, 'confirmed')
    if (info) {
      if (info.data.length < 72) throw new Error('not a token account')
      return Buffer.from(info.data).readBigUInt64LE(64)
    }
    if (i < 2) await sleep(1500)
  }
  return 0n
}

/** Change in `owner`'s balance of `mint` inside one confirmed transaction (from its own pre/post balances). */
export async function tokenDeltaInTx(conn, sig, owner, mint, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }).catch(() => null)
    if (tx?.meta) {
      const sum = (list) => (list || [])
        .filter((b) => b.owner === owner.toBase58() && b.mint === mint.toBase58())
        .reduce((s, b) => s + BigInt(b.uiTokenAmount.amount), 0n)
      return sum(tx.meta.postTokenBalances) - sum(tx.meta.preTokenBalances)
    }
    await sleep(2000)
  }
  return null
}

export const pk = (s) => new PublicKey(s)
