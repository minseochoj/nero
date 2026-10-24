// Nero solver: pure logic, no I/O (unit-tested).
//
// An order is one Solana transaction signed by the user: an optional swap into SOL, a SOL transfer of exactly the
// quoted lamports to the solver's deposit wallet, and a memo
//     r2:<base64( quoteId[8] | sha256(secret)[0..12] | ephemeralPub[32] | box(address bytes) )>
// The Monero address (its 69 raw bytes, 77 if integrated) is sealed with nacl.box to the solver's X25519 key, so
// it never appears on Solana in the clear. Kept compact (~185 chars) so the transaction leaves room for the
// wallet's own guard instruction. The solver then pays real XMR from its own Monero wallet, or refunds the SOL.
// Never both, never twice.
import nacl from 'tweetnacl'
import { createHash } from 'crypto'
import { checkMoneroAddress, base58Decode, base58Encode } from './lib/monero.js'

export const MEMO_PREFIX = 'r2'

/* ---------- address sealing (the browser does the same with tweetnacl) ---------- */

// one fresh ephemeral key per order, so the nonce can be derived instead of sent
const sealNonce = (ephPub, solverPub) => new Uint8Array(createHash('sha256').update(Buffer.from(ephPub)).update(Buffer.from(solverPub)).digest().subarray(0, 24))

/** ephemeralPub(32) | nacl.box(address bytes) as raw bytes */
export function sealAddress(address, solverBoxPub, eph = nacl.box.keyPair()) {
  const bin = base58Decode(address)
  if (!bin) throw new Error('not a Monero address')
  const c = nacl.box(bin, sealNonce(eph.publicKey, solverBoxPub), solverBoxPub, eph.secretKey)
  return Buffer.concat([Buffer.from(eph.publicKey), Buffer.from(c)])
}
export function openAddress(sealed, solverBoxSecret) {
  const raw = Buffer.isBuffer(sealed) ? sealed : Buffer.from(sealed || '', 'base64')
  if (raw.length !== 32 + 16 + 69 && raw.length !== 32 + 16 + 77) return null
  const eph = new Uint8Array(raw.subarray(0, 32))
  const solverPub = nacl.box.keyPair.fromSecretKey(solverBoxSecret).publicKey
  const m = nacl.box.open(new Uint8Array(raw.subarray(32)), sealNonce(eph, solverPub), eph, solverBoxSecret)
  return m ? base58Encode(m) : null
}

/* ---------- memo ---------- */

/** quote ids are 8 random bytes (16 hex); the secret hash is the first 12 bytes of sha256(secret) (24 hex) */
export const secretHash = (secretHex) => createHash('sha256').update(Buffer.from(secretHex, 'hex')).digest().subarray(0, 12).toString('hex')
export const formatMemo = (quoteId, secretHashHex, sealed) =>
  `${MEMO_PREFIX}:${Buffer.concat([Buffer.from(quoteId, 'hex'), Buffer.from(secretHashHex, 'hex'), Buffer.from(sealed)]).toString('base64')}`
export function parseMemo(s) {
  if (typeof s !== 'string') return null
  const m = s.match(/^r2:([A-Za-z0-9+/]{180,200}={0,2})$/)
  if (!m) return null
  const raw = Buffer.from(m[1], 'base64')
  if (raw.length !== 20 + 32 + 16 + 69 && raw.length !== 20 + 32 + 16 + 77) return null
  return { quoteId: raw.subarray(0, 8).toString('hex'), secretHash: raw.subarray(8, 20).toString('hex'), sealed: raw.subarray(20) }
}

/* ---------- pricing and limits ---------- */

/** XMR (pico) we promise for `marketPico` of wXMR the same SOL would buy, after our spread. */
export const priceWithSpread = (marketPico, spreadBps) => (BigInt(marketPico) * BigInt(10_000 - spreadBps)) / 10_000n

/** Can we quote this much right now? `free` = unlocked XMR not already promised to open quotes/orders. */
export function quoteLimit({ xmrOut, free, minPico, maxPico, dailyLeft }) {
  const x = BigInt(xmrOut)
  if (x < BigInt(minPico)) return 'Below the minimum for a private exit'
  if (x > BigInt(maxPico)) return 'Above the per-order maximum for a private exit right now'
  if (x > BigInt(dailyLeft)) return 'The private exit has reached today\'s limit. Try the standard exit'
  if (x > BigInt(free)) return 'Not enough XMR available for a private exit right now. Try a smaller amount or the standard exit'
  return null
}

/* ---------- the decision for one incoming deposit ---------- */

/**
 * facts: { memo (parsed or null), lamportsIn, sender, blockTime, quote (stored quote or undefined), alreadySeen (bool),
 *          address (opened or null), unlocked (bigint pico available for this order), dailyLeft (bigint pico) }
 * returns { action: 'ignore' | 'hold' | 'pay' | 'refund', reason, burnQuote }
 *   hold   = SOL arrived without a Nero order (exchange withdrawals, rent returns, mistakes): a human decides,
 *            because the fee payer is not necessarily who the SOL belongs to
 *   refund = a Nero order that cannot be paid: SOL goes back to the order's sender, minus the network fee
 *   burnQuote = whether this deposit consumes the quote (only the quote's own wallet, with enough SOL, can burn it,
 *               so nobody can copy a memo to cancel someone else's order)
 */
export function decide(f) {
  if (f.alreadySeen) return { action: 'ignore', reason: 'already handled' }
  if (!(f.lamportsIn > 0n)) return { action: 'ignore', reason: 'no SOL received' }
  if (!f.memo) return { action: 'hold', reason: 'no Nero order in the transaction' }
  const q = f.quote
  if (!q) return { action: 'refund', reason: 'unknown quote' }
  const owns = !q.wallet || q.wallet === f.sender
  const enough = f.lamportsIn >= BigInt(q.lamports)
  const burnQuote = !q.used && owns && enough
  const refund = (reason) => ({ action: 'refund', reason, burnQuote })
  if (q.used) return { action: 'refund', reason: 'quote already used', burnQuote: false }
  if (!owns) return { action: 'refund', reason: 'quote was issued to another wallet', burnQuote: false }
  if (!enough) return { action: 'refund', reason: 'less SOL than quoted', burnQuote: false }
  if (!f.blockTime || f.blockTime > q.expiresAt) return refund('quote expired before the transaction landed')
  if (!f.address) return refund('the sealed address could not be opened')
  const chk = checkMoneroAddress(f.address)
  if (!chk.ok) return refund(chk.reason)
  if (f.dailyLeft !== undefined && BigInt(q.xmrOut) > f.dailyLeft) return refund('daily limit reached')
  if (f.unlocked < BigInt(q.xmrOut)) return refund('not enough unlocked XMR')
  return { action: 'pay', reason: 'ok', burnQuote: true }
}

// Refunds below this are not worth sending and can fail on rent (a closed sender needs >= 890,880 lamports back).
export const DUST_LAMPORTS = 2_000_000n
/** Refund amount: what came in, minus the transaction fee we pay to send it back; 0 below the dust line. */
export function refundLamports(lamportsIn, feeLamports = 10_000n) {
  const r = lamportsIn - feeLamports
  return r >= DUST_LAMPORTS ? r : 0n
}

/** XMR per lamport from two independent USD prices, as pico for `lamports` (oracle cross-check for quotes). */
// lamports * 1e-9 SOL * (SOL/XMR price ratio) * 1e12 pico = lamports * ratio * 1e3 (ratio carried at 1e9 precision)
export const oraclePico = (lamports, solUsd, xmrUsd) => (BigInt(lamports) * BigInt(Math.round((solUsd / xmrUsd) * 1e9))) / 1_000_000n
/** Quote from the lower of the pool and the oracle, so a pushed pool cannot buy XMR above the market. */
export const fairPico = (poolPico, oracle) => (BigInt(poolPico) < BigInt(oracle) ? BigInt(poolPico) : BigInt(oracle))

/**
 * Monero locks a transaction's change for 10 blocks (~20 min). With a few big outputs, a handful of small orders
 * locks the whole float. So the float is kept as many small pieces: each order spends only the pieces it needs
 * (a larger order just uses several), and many orders can go out back to back.
 * Splits one big output per call, and only if the rest of the float can still cover a max-size order meanwhile.
 * Returns { pieces, piecePico } or null.
 */
export function splitPlan(outputs, { maxPico, piecePico = 100_000_000_000n, want = 24, maxPieces = 15 }) {
  if (!outputs.length) return null
  const usable = outputs.filter((o) => o >= piecePico / 2n).length
  if (usable >= want) return null
  const big = outputs[0]
  if (big < piecePico * 3n) return null // nothing worth cutting
  const rest = outputs.reduce((n, o) => n + o, 0n) - big
  if (outputs.length > 1 && rest < maxPico) return null // keep serving orders while a split is locked
  const pieces = Math.min(maxPieces, Number(big / piecePico) - 1) // leave about one piece as change
  return pieces >= 2 ? { pieces, piecePico } : null
}

/** A cached pool rate applied to a new amount: pico = lamports * outPico / inLamports. */
export const applyRate = (lamports, rate) => (BigInt(lamports) * BigInt(rate.outPico)) / BigInt(rate.inLamports)
/** Amounts within the same power of two share a cached rate (price impact inside a bucket is negligible at our sizes). */
export const rateBucket = (lamports) => BigInt(lamports).toString(2).length

/** The text of an order's signed promise. One line per fact, so a person can read it and a program can check it. */
const xmrText = (pico) => { const p = BigInt(pico); return `${p / 1_000_000_000_000n}.${(p % 1_000_000_000_000n).toString().padStart(12, '0')}` }
export function promiseText({ order, send, to, xmrOut, sealed, expiresAt, refund, signer }) {
  return [
    'Nero order promise v1',
    `order: ${order}`,
    `you send: ${send} lamports of SOL to ${to}`,
    `you get: ${xmrOut} piconero (${xmrText(xmrOut)} XMR)`,
    `paid to: the Monero address sealed in this order, sha256 ${createHash('sha256').update(String(sealed)).digest('hex')}`,
    `valid until: ${new Date(expiresAt * 1000).toISOString()}`,
    refund ? `if it cannot be paid: the SOL is refunded to ${refund}, minus the network fee` : 'if it cannot be paid: repriced at the rate of that moment, or held for a person to settle, never kept',
    `signed by: ${signer}`,
  ].join('\n')
}
