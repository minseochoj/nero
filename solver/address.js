// Private exit without a wallet connection: each order gets its own one-time Solana deposit address. The user sends
// SOL to it from any wallet or exchange; the solver pays XMR from its own Monero wallet, or refunds to the Solana
// refund address the user gave (the sender of an exchange withdrawal is not the user, so a refund address is required).
//
// Cross-chain orders (via: 'x') are the same thing fed from another chain: a route provider delivers SOL to the one-time
// address. The sender has no Solana address, so nothing is ever refunded on Solana for them: a deposit that arrives
// late or short is paid at the rate of that moment instead, and anything that cannot be paid is held for a human.
//
// Slow chains (Bitcoin, Zcash, ...) cannot promise to arrive inside a 15-minute window, so their orders carry no locked
// rate at all (float: true): nothing is reserved, and whatever SOL arrives is paid at the rate of that moment.
//
// One-time keys are derived, not stored: ed25519 seed = sha256(SOLVER_ADDR_SEED | order id).
// Same money rules as wallet orders: finalized deposits only, every send booked before it goes out, never retried
// blindly, anything ambiguous becomes 'stuck' for a human.
import { createHash, randomBytes } from 'crypto'
import { Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js'
import bs58 from 'bs58'
import { sendSafe } from './lib/chain.js'
import { checkMoneroAddress } from './lib/monero.js'
import { DUST_LAMPORTS, openAddress, quoteLimit } from './core.js'
import { definitelyNotSent } from './xmr.js'

const SOL = 'So11111111111111111111111111111111111111112'

export function orderKeypair(seedHex, id) {
  return Keypair.fromSeed(createHash('sha256').update(Buffer.from(seedHex, 'hex')).update(Buffer.from(id, 'hex')).digest())
}

export const X_GIVE_UP_SECS = 86_400 // how long a cross-chain deposit keeps being retried at the current rate
export const X_HONOUR_SECS = 3_600   // a cross-chain deposit that was complete in time keeps its quoted rate this long while the payout is retried

/** Pure: what to do with an address order given its finalized balance and the time. */
export function decideAddress(o, { balance, now, grace = 90 }) {
  const need = BigInt(o.lamports)
  if (o.status !== 'awaiting' && o.status !== 'expired') return { action: 'none' }
  const x = o.via === 'x'
  const inWindow = now <= o.expiresAt + grace
  if (x && o.float) {
    // no locked rate: money that arrives is paid at the rate of the moment; nothing is ever refunded on Solana
    if (balance >= DUST_LAMPORTS) {
      if (now > (o.giveUpAt || o.expiresAt + X_GIVE_UP_SECS)) return { action: 'hold', reason: 'could not be paid within a day' }
      return now >= (o.nextTryAt || 0) ? { action: 'reprice', reason: 'rate set on arrival' } : { action: 'wait' }
    }
    if (balance === 0n && !inWindow && o.status === 'awaiting') return { action: 'expire' }
    if (now > o.expiresAt + 86_400) return { action: 'forget' }
    return { action: 'wait' }
  }
  // fundedAt is set the first time a full deposit is seen inside the window: that customer did their part on time
  const honoured = x && !!o.fundedAt && now <= o.expiresAt + X_HONOUR_SECS
  if (balance >= need && o.status === 'awaiting' && (inWindow || honoured)) return now >= (o.nextTryAt || 0) ? { action: 'pay' } : { action: 'wait' }
  if (balance >= DUST_LAMPORTS && !inWindow) {
    const reason = x && o.fundedAt ? 'could not be paid at the quoted rate within an hour' : balance >= need ? 'arrived after the quote expired' : 'less SOL than quoted'
    if (!x) return { action: 'refund', reason }
    // no Solana address to refund to: pay what arrived at the rate of the moment; after a day, a human decides
    if (now > (o.giveUpAt || o.expiresAt + X_GIVE_UP_SECS)) return { action: 'hold', reason: 'could not be paid within a day' }
    return now >= (o.nextTryAt || 0) ? { action: 'reprice', reason } : { action: 'wait' }
  }
  if (balance === 0n && !inWindow && o.status === 'awaiting') return { action: 'expire' }
  if (now > o.expiresAt + 86_400) return { action: 'forget' } // a day after expiry: stop watching (late funds need the admin)
  return { action: 'wait' }
}

/**
 * Pure: can a late or short cross-chain deposit be paid now, at the rate of the moment?
 * 'pay' | 'wait' (the reserve or today's limit cannot cover it yet) | 'small' (less than an order may be: more may
 * still arrive, so keep watching) | 'hold' (more than an order may be: a human decides).
 */
export function repriceVerdict({ xmrOut, minPico, maxPico, free, dailyLeft }) {
  const x = BigInt(xmrOut)
  if (x > BigInt(maxPico)) return 'hold'
  if (x < BigInt(minPico)) return 'small'
  if (x > BigInt(dailyLeft) || x > BigInt(free)) return 'wait'
  return 'pay'
}

/** Build a transaction that empties `from` exactly: optional `first` transfer, the rest to `to`, fee paid by `from`. */
async function emptyingTx(conn, kp, to, balance, first = null) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('finalized')
  const build = (rest) => {
    const ixs = []
    if (first) ixs.push(SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: first.to, lamports: first.lamports }))
    ixs.push(SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: to, lamports: rest }))
    return new TransactionMessage({ payerKey: kp.publicKey, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message()
  }
  const fee = BigInt((await conn.getFeeForMessage(build(1n), 'finalized')).value ?? 5000)
  const rest = balance - fee - (first ? first.lamports : 0n)
  if (rest <= 0n) throw new Error('balance does not cover the fee')
  const tx = new VersionedTransaction(build(rest))
  tx.sign([kp])
  return { tx, lastValidBlockHeight, sig: bs58.encode(tx.signatures[0]), rest, fee }
}

export function createAddressApi(ctx) {
  const { S, C, conn, wallet, save, log, store, boxSecret, seedHex, deposit, price, reservedXmr, dailyLeft, limit } = ctx
  S.addr = S.addr || {}
  const open = () => Object.values(S.addr).filter((o) => o.status === 'awaiting' && !o.float)
  const openFloat = () => Object.values(S.addr).filter((o) => o.status === 'awaiting' && o.float)

  /** XMR we would promise for `lamports`, with the longer-lock surcharge. No reservation. */
  async function estimate(lamports) {
    if (!/^\d{1,18}$/.test(String(lamports || ''))) throw Object.assign(new Error('bad amount'), { status: 400 })
    const xmrOut = await price(BigInt(lamports), C.spreadBps + C.addrExtraBps)
    return { lamports: String(lamports), xmrOut: String(xmrOut), ttl: C.addrTtl, feeBps: C.spreadBps + C.addrExtraBps }
  }

  async function create({ amount, sealed, secretHash: sh, refund, via, float, ip }) {
    if (!C.enabled || !C.payouts) throw Object.assign(new Error('The private exit is not open right now'), { status: 503 })
    const x = via === 'x'
    if (via !== undefined && !x) throw Object.assign(new Error('bad order type'), { status: 400 })
    if (x && !C.xchain) throw Object.assign(new Error('Exits from other chains are not open yet'), { status: 503 })
    if (float !== undefined && float !== true) throw Object.assign(new Error('bad order type'), { status: 400 })
    if (float && !x) throw Object.assign(new Error('bad order type'), { status: 400 })
    if (float && !C.xfloat) throw Object.assign(new Error('Exits from this network are not open yet'), { status: 503 })
    limit('addr-ip:' + ip, 4, 600_000)
    // floating orders stay open for hours and reserve nothing, so they have their own limit and do not crowd out the others
    if ((float ? openFloat() : open()).length >= (float ? C.xFloatMaxOpen : C.addrMaxOpen)) throw Object.assign(new Error('Too many open orders right now. Try again in a few minutes.'), { status: 503 })
    if (!/^[0-9a-f]{24}$/.test(sh || '')) throw Object.assign(new Error('bad secret hash'), { status: 400 })
    if (typeof sealed !== 'string' || !/^[A-Za-z0-9+/=]{150,180}$/.test(sealed)) throw Object.assign(new Error('bad sealed address'), { status: 400 })
    let refundPk = null
    if (!x) {
      try { refundPk = new PublicKey(refund) } catch { throw Object.assign(new Error('Enter a Solana address for refunds'), { status: 400 }) }
      if (!PublicKey.isOnCurve(refundPk.toBytes())) throw Object.assign(new Error('The refund address must be a wallet address, not a token account'), { status: 400 })
    } else if (refund !== undefined && refund !== null) throw Object.assign(new Error('a cross-chain order takes no Solana refund address'), { status: 400 })
    const address = openAddress(Buffer.from(sealed, 'base64'), boxSecret)
    const chk = address ? checkMoneroAddress(address) : { ok: false, reason: 'The sealed address could not be opened' }
    if (!chk.ok) throw Object.assign(new Error(chk.reason), { status: 400 })
    const { xmrOut } = await estimate(amount)
    const { unlocked } = await wallet.balance()
    const why = quoteLimit({ xmrOut, free: unlocked - reservedXmr(), minPico: C.minPico, maxPico: x ? xMax() : C.maxPico, dailyLeft: dailyLeft() })
    if (why) throw Object.assign(new Error(why), { status: 400 })
    const id = randomBytes(8).toString('hex')
    const addr = orderKeypair(seedHex, id).publicKey.toBase58()
    const now = Math.floor(Date.now() / 1000)
    const ttl = float ? C.xFloatTtl : C.addrTtl
    // for a floating order, lamports and xmrOut are only what was expected when it was made; the payout is priced on arrival
    S.addr[addr] = { id, addr, refund: refundPk ? refundPk.toBase58() : null, ...(x ? { via: 'x' } : {}), ...(float ? { float: true } : {}), lamports: String(amount), xmrOut: String(xmrOut), sealed, secretHash: sh, createdAt: now, expiresAt: now + ttl, status: 'awaiting' }
    save()
    log(float ? 'cross-chain order (rate on arrival)' : x ? 'cross-chain order' : 'address order', addr, amount, '->', String(xmrOut))
    return { address: addr, lamports: String(amount), xmrOut: String(xmrOut), expiresAt: now + ttl, inputMint: SOL, ...(float ? { float: true } : {}) }
  }

  const xMax = () => (C.xMaxPico < C.maxPico ? C.xMaxPico : C.maxPico)
  // an order that cannot be paid: back to the sender on Solana if there is an address for that, otherwise to a human
  // (a cross-chain order that merely has to wait goes back to 'expired' and is tried again at the rate of that moment)
  const cannotPay = (o, reason, { retry = false } = {}) => {
    const now = Math.floor(Date.now() / 1000)
    if (o.refund) { o.status = 'refund_pending'; o.reason = reason }
    else if (retry) {
      // a deposit that was complete in time keeps its place and its quoted rate for X_HONOUR_SECS; any other goes back to
      // being repriced. Either way the XMR it needs stays reserved, so newer quotes cannot take it first.
      const honoured = !!o.fundedAt && now <= o.expiresAt + X_HONOUR_SECS
      o.status = honoured ? 'awaiting' : 'expired'
      if (!honoured) o.wantPico = o.xmrOut
      if (o.reason !== reason) log('cross-chain order waiting', o.addr, reason)
      o.reason = reason; o.nextTryAt = now + 120
    }
    else { o.status = 'held'; o.note = reason; delete o.wantPico; log('HELD cross-chain order', o.addr, reason) }
  }

  /** A cross-chain deposit that arrived late or short: pay what arrived at the current rate, or wait, or hold. */
  async function reprice(o, balance, reason) {
    const now = Math.floor(Date.now() / 1000)
    let xmrOut, unlocked
    try {
      xmrOut = await price(balance, C.spreadBps + C.addrExtraBps)
      unlocked = (await wallet.balance()).unlocked
    } catch (e) { o.nextTryAt = now + 120; o.received = String(balance); save(); log('reprice: no price or balance yet', o.addr, e.message); return }
    const verdict = repriceVerdict({ xmrOut, minPico: C.minPico, maxPico: xMax(), free: unlocked - reservedXmr(o.addr), dailyLeft: dailyLeft() })
    if (verdict === 'hold') { o.status = 'held'; o.received = String(balance); delete o.wantPico; o.note = `cross-chain deposit ${reason}; ${balance} lamports is more than one order may be`; save(); log('HELD cross-chain order', o.addr, o.note); return }
    if (verdict === 'wait' || verdict === 'small') {
      const why = verdict === 'small' ? 'less than the smallest order' : 'waiting for XMR to be available'
      if (o.reason !== why || o.received !== String(balance)) log('cross-chain order waiting', o.addr, String(balance), 'lamports:', why)
      o.status = 'expired'; o.reason = why; o.received = String(balance); o.nextTryAt = now + 300
      if (verdict === 'wait') o.wantPico = String(xmrOut); else delete o.wantPico // XMR for a funded order stays reserved
      save(); return
    }
    if (!o.quoted) o.quoted = { lamports: o.lamports, xmrOut: o.xmrOut } // what was first promised, kept for the record
    o.lamports = String(balance); o.xmrOut = String(xmrOut); o.received = String(balance); save()
    log('repricing cross-chain order', o.addr, balance, '->', String(xmrOut), `(${reason})`)
    await payOrder(o, balance)
    if (o.status === 'paid') { if (!o.float) o.repriced = reason; save(); await sweep(o, balance) } // only a paid order says it was repriced
  }

  async function payOrder(o, balance) {
    const address = openAddress(Buffer.from(o.sealed, 'base64'), boxSecret)
    const { unlocked } = await wallet.balance()
    if (!address) { cannotPay(o, 'the sealed address could not be opened'); save(); return }
    if (BigInt(o.xmrOut) > dailyLeft() || unlocked - reservedXmr(o.addr) < BigInt(o.xmrOut)) { cannotPay(o, 'not enough XMR available', { retry: true }); save(); return }
    o.status = 'paying'; o.received = String(balance); save()
    try {
      const r = await wallet.pay(address, BigInt(o.xmrOut))
      Object.assign(o, { status: 'paid', xmrTx: r.txHash, txKey: r.txKey, xmrFee: r.fee, paidAt: Math.floor(Date.now() / 1000) })
      delete o.wantPico; delete o.nextTryAt
      ctx.onPaid(BigInt(o.xmrOut), BigInt(o.lamports))
      store.append('paid.jsonl', { addr: o.addr, xmrOut: o.xmrOut, xmrTx: r.txHash })
      log('PAID (address order)', o.addr, o.xmrOut, 'pico ->', r.txHash)
    } catch (e) {
      if (definitelyNotSent(e)) cannotPay(o, 'payout failed: ' + e.walletMessage, { retry: !/invalid (destination )?address/i.test(e.walletMessage || '') })
      else { o.status = 'stuck'; o.note = 'payout outcome unknown: ' + String(e.message).slice(0, 300); log('STUCK address payout', o.addr, e.message) }
    }
    save()
  }

  /** After a paid order: send any overpayment back, then move the SOL to the main deposit wallet. */
  async function sweep(o, balance) {
    if (balance < DUST_LAMPORTS) { o.swept = true; save(); return }
    const kp = orderKeypair(seedHex, o.id)
    const extra = balance - BigInt(o.lamports)
    const first = extra >= DUST_LAMPORTS && o.refund ? { to: new PublicKey(o.refund), lamports: extra } : null
    if (extra >= DUST_LAMPORTS && !o.refund && !o.excessKept) { o.excessKept = String(extra); log('cross-chain order received more than it needed', o.addr, String(extra)) } // nowhere on Solana to return it: recorded for a human
    let built
    try { built = await emptyingTx(conn, kp, deposit, balance, first) } catch (e) { log('sweep build error (will retry)', o.addr, e.message); return }
    const r = await sendSafe(conn, built)
    if (r.status === 'confirmed') { o.swept = true; o.sweepSig = r.sig; if (first) o.excessRefunded = String(extra) }
    else if (r.status !== 'not_landed') { o.swept = true; o.note = `sweep ${r.status}: ${r.sig} (funds stay at ${o.addr}; recoverable with the order key)`; log('sweep not confirmed', o.addr, r.status) }
    save()
  }

  async function refundOrder(o, balance) {
    if (!o.refund) { o.status = 'held'; o.note = `no Solana refund address (cross-chain order): ${o.reason || 'could not be paid'}`; save(); log('HELD cross-chain order', o.addr, o.note); return }
    if (balance < DUST_LAMPORTS) { o.status = 'ignored_dust'; save(); return }
    const kp = orderKeypair(seedHex, o.id)
    let built
    try { built = await emptyingTx(conn, kp, new PublicKey(o.refund), balance) } catch (e) { log('refund build error (will retry)', o.addr, e.message); return }
    o.status = 'refunding'; o.tries = (o.tries || 0) + 1; save()
    const r = await sendSafe(conn, built)
    if (r.status === 'confirmed') { o.status = 'refunded'; o.refundSig = r.sig; store.append('refunds.jsonl', { addr: o.addr, lamports: String(built.rest), refundSig: r.sig, reason: o.reason }); log('REFUNDED (address order)', o.addr) }
    else if (r.status === 'not_landed' && o.tries < 3) o.status = 'refund_pending'
    else { o.status = 'stuck'; o.note = `refund ${r.status}: ${r.sig}` }
    save()
  }

  /**
   * Money that reaches a one-time address after its order was settled has no one watching it: look now and then, and
   * hand it to a human. A closed cross-chain order becomes 'held'. A paid or refunded order keeps its status (it WAS
   * settled) and gets a lateFunds mark instead: it is never paid again by itself, because nothing here can prove the
   * balance is new money and not a sweep that has not finalized.
   */
  let passes = 0
  async function lateScan(now) {
    const settled = Object.values(S.addr).filter((o) => now - o.expiresAt < 14 * 86_400 && !o.lateFunds && (
      (o.via === 'x' && o.status === 'closed') ||
      (o.status === 'paid' && o.swept && now - (o.paidAt || now) > 900) ||
      (o.status === 'refunded')))
    for (let i = 0; i < settled.length; i += 90) {
      const part = settled.slice(i, i + 90)
      const infos = await conn.getMultipleAccountsInfo(part.map((o) => new PublicKey(o.addr)), 'finalized')
      for (let j = 0; j < part.length; j++) {
        const o = part[j], balance = BigInt(infos[j]?.lamports || 0)
        if (balance < DUST_LAMPORTS || o.lateFundsResolved === String(balance)) continue
        if (o.status === 'closed') { Object.assign(o, { status: 'held', received: String(balance), note: 'funds arrived after the order was closed' }); log('HELD cross-chain order', o.addr, String(balance), 'lamports arrived after the order was closed') }
        else { o.lateFunds = String(balance); log('LATE FUNDS at a settled order address', o.addr, o.status, String(balance), 'lamports: needs a human') }
        save()
      }
    }
  }

  /** One pass over every watched order. Balances are read at 'finalized'. */
  async function tick() {
    const now = Math.floor(Date.now() / 1000)
    if (++passes % 20 === 0) await lateScan(now).catch((e) => log('late scan:', e.message))
    const watch = Object.values(S.addr).filter((o) => ['awaiting', 'expired', 'refund_pending'].includes(o.status) || (o.status === 'paid' && !o.swept))
    if (!watch.length) return
    for (let i = 0; i < watch.length; i += 90) {
      const part = watch.slice(i, i + 90)
      const infos = await conn.getMultipleAccountsInfo(part.map((o) => new PublicKey(o.addr)), 'finalized')
      for (let j = 0; j < part.length; j++) {
        const o = part[j], balance = BigInt(infos[j]?.lamports || 0)
        if (o.status === 'paid') { await sweep(o, balance); continue }
        if (o.status === 'refund_pending') { await refundOrder(o, balance); continue }
        const d = decideAddress(o, { balance, now })
        if (d.action === 'pay') {
          if (o.via === 'x' && !o.fundedAt) o.fundedAt = now // complete and on time: this order keeps its quote (saved by payOrder)
          await payOrder(o, balance); if (o.status === 'paid') await sweep(o, balance)
        }
        else if (d.action === 'refund') { o.reason = d.reason; await refundOrder(o, balance) }
        else if (d.action === 'reprice') await reprice(o, balance, d.reason)
        else if (d.action === 'hold') { o.status = 'held'; o.received = String(balance); o.note = `cross-chain deposit ${d.reason}`; save(); log('HELD cross-chain order', o.addr, o.note) }
        else if (d.action === 'expire') { o.status = 'expired'; save() }
        else if (d.action === 'forget') { o.status = 'closed'; save() }
      }
    }
  }

  // XMR held back for address orders: open ones still inside their window, and payouts in flight
  // ... and cross-chain orders whose SOL is already here and are waiting for their payout
  const reserved = (except = null) => Object.values(S.addr)
    .filter((o) => o.addr !== except && ((o.status === 'awaiting' && !o.float && (o.expiresAt + 120 > Date.now() / 1000 || !!o.fundedAt)) || o.status === 'paying' || (o.status === 'expired' && !!o.wantPico)))
    .reduce((s, o) => s + BigInt(o.status === 'expired' ? o.wantPico : o.xmrOut), 0n)

  return { estimate, create, tick, reserved, isOurs: (pubkey) => !!S.addr[pubkey] }
}
