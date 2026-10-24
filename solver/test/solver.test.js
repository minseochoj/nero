import test from 'node:test'
import assert from 'node:assert/strict'
import nacl from 'tweetnacl'
import { sealAddress, openAddress, formatMemo, parseMemo, secretHash, priceWithSpread, quoteLimit, decide, refundLamports, oraclePico, fairPico, splitPlan, applyRate, rateBucket, promiseText } from '../core.js'

// a real mainnet-format primary address (valid checksum + points), from the bridge tests
const ADDR = '82wez4jsocbZf9DAYmM5HsbKre6pnE5LuSCnbAwVJDTKKYEfuvKeacaTgRddrJvVSBB6PwisuYtNvZes37G2PVJ3EKWgJYX'
const box = nacl.box.keyPair()

test('sealed address opens only with the solver key', () => {
  const s = sealAddress(ADDR, box.publicKey)
  assert.equal(s.length, 32 + 16 + 69) // ephemeral key + MAC + raw address bytes
  assert.equal(openAddress(s, box.secretKey), ADDR)
  assert.equal(openAddress(s, nacl.box.keyPair().secretKey), null)
  const t = Buffer.from(s); t[70] ^= 1
  assert.equal(openAddress(t, box.secretKey), null) // tampered
  assert.equal(openAddress(Buffer.alloc(10), box.secretKey), null)
  assert.notDeepEqual(sealAddress(ADDR, box.publicKey), s) // fresh ephemeral key each time
  assert.throws(() => sealAddress('not an address!', box.publicKey))
})

test('memo round trip, compact, strict parsing', () => {
  const sealed = sealAddress(ADDR, box.publicKey)
  const qid = 'ab'.repeat(8), h = secretHash('00'.repeat(32))
  assert.equal(h.length, 24)
  const m = formatMemo(qid, h, sealed)
  assert.ok(m.length < 200, String(m.length)) // small enough to leave the wallet room in the transaction
  const p = parseMemo(m)
  assert.equal(p.quoteId, qid); assert.equal(p.secretHash, h); assert.deepEqual(p.sealed, sealed)
  assert.equal(openAddress(p.sealed, box.secretKey), ADDR)
  assert.equal(m.includes(ADDR), false)
  assert.equal(parseMemo('r2:xyz'), null)
  assert.equal(parseMemo(m.replace('r2', 'r3')), null)
  assert.equal(parseMemo(m.slice(0, -8)), null)
  assert.equal(parseMemo(null), null)
})

test('pricing and limits', () => {
  assert.equal(priceWithSpread(1_000_000_000_000n, 60), 994_000_000_000n)
  const base = { minPico: 10_000_000_000n, maxPico: 1_000_000_000_000n, dailyLeft: 5_000_000_000_000n, free: 2_000_000_000_000n }
  assert.equal(quoteLimit({ ...base, xmrOut: 500_000_000_000n }), null)
  assert.match(quoteLimit({ ...base, xmrOut: 1n }), /minimum/)
  assert.match(quoteLimit({ ...base, xmrOut: 1_500_000_000_000n }), /maximum/)
  assert.match(quoteLimit({ ...base, xmrOut: 500_000_000_000n, free: 1n }), /Not enough/)
  assert.match(quoteLimit({ ...base, xmrOut: 500_000_000_000n, dailyLeft: 1n }), /limit/)
})

test('decide: pay only when every check passes; otherwise refund, hold or ignore', () => {
  const quote = { lamports: '1000000000', xmrOut: '200000000000', expiresAt: 1000, wallet: 'U', used: false }
  const ok = { memo: { quoteId: 'q' }, lamportsIn: 1_000_000_000n, sender: 'U', blockTime: 990, quote, address: ADDR, unlocked: 300_000_000_000n, dailyLeft: 10n ** 13n, alreadySeen: false }
  assert.deepEqual(decide(ok), { action: 'pay', reason: 'ok', burnQuote: true })
  assert.equal(decide({ ...ok, alreadySeen: true }).action, 'ignore')
  assert.equal(decide({ ...ok, lamportsIn: 0n }).action, 'ignore')
  assert.equal(decide({ ...ok, memo: null }).action, 'hold') // not ours to guess who to refund
  for (const [patch, why, burns] of [
    [{ quote: undefined }, /unknown quote/, undefined],
    [{ quote: { ...quote, used: true } }, /already used/, false],
    [{ sender: 'V' }, /another wallet/, false],          // a copied memo cannot burn the real order
    [{ lamportsIn: 999_999_999n }, /less SOL/, false],   // neither can a short deposit
    [{ blockTime: 1001 }, /expired/, true],
    [{ blockTime: null }, /expired/, true],
    [{ address: null }, /could not be opened/, true],
    [{ address: ADDR.slice(0, -1) + 'Z' }, /./, true],
    [{ dailyLeft: 1n }, /daily limit/, true],
    [{ unlocked: 1n }, /not enough unlocked/, true],
  ]) {
    const d = decide({ ...ok, ...patch })
    assert.equal(d.action, 'refund', Object.keys(patch).join(','))
    assert.match(d.reason, why)
    assert.equal(d.burnQuote, burns, Object.keys(patch).join(','))
  }
})

test('refunds below the rent-safe dust line are not sent', () => {
  assert.equal(refundLamports(1_000_000_000n), 999_990_000n)
  assert.equal(refundLamports(1_000_000n), 0n)
  assert.equal(refundLamports(2_010_000n), 2_000_000n)
})

test('oracle cross-check: pool above the oracle is capped at the oracle', () => {
  const ref = oraclePico(1_000_000_000n, 108.7, 523)
  assert.ok(ref > 207_000_000_000n && ref < 209_000_000_000n)
  assert.equal(fairPico(ref * 2n, ref), ref)
  assert.equal(fairPico(ref - 5n, ref), ref - 5n)
})

test('float split: many small pieces, one big output at a time, never starving live orders', () => {
  const X = 1_000_000_000_000n, P = 100_000_000_000n, M = 500_000_000_000n
  // seven 0.525 pieces + change: cut the biggest into 0.1s
  const float = [996_000_000_000n, ...Array(6).fill(525_000_000_000n)]
  assert.deepEqual(splitPlan(float, { maxPico: M }), { pieces: 8, piecePico: P })
  assert.equal(splitPlan(Array(24).fill(P), { maxPico: M }), null)                    // already enough pieces
  assert.equal(splitPlan([250_000_000_000n, P, P], { maxPico: M }), null)             // biggest too small to cut
  assert.equal(splitPlan([X * 3n, P], { maxPico: M }), null)                          // the rest could not serve a max order meanwhile
  assert.deepEqual(splitPlan([X * 4n], { maxPico: M }), { pieces: 15, piecePico: P }) // a single fresh deposit: cut it, capped per transaction
  assert.equal(splitPlan([], { maxPico: M }), null)
})

test('cached pool rate scales linearly and buckets by size', () => {
  const rate = { inLamports: '1000000000', outPico: '207000000000' }
  assert.equal(applyRate(500_000_000n, rate), 103_500_000_000n)
  assert.equal(applyRate(1_000_000_000n, rate), 207_000_000_000n)
  assert.equal(rateBucket(600_000_000n), rateBucket(900_000_000n))
  assert.notEqual(rateBucket(100_000_000n), rateBucket(900_000_000n))
})

import { decideAddress, orderKeypair, repriceVerdict, createAddressApi, X_GIVE_UP_SECS, X_HONOUR_SECS } from '../address.js'
import { Keypair } from '@solana/web3.js'

test('address orders: pay only a full, on-time deposit; refund late or short; never guess', () => {
  const o = { status: 'awaiting', lamports: '1000000000', expiresAt: 1000 }
  const d = (balance, now, status = 'awaiting') => decideAddress({ ...o, status }, { balance, now }).action
  assert.equal(d(0n, 500), 'wait')
  assert.equal(d(999_999_999n, 500), 'wait')            // partial: keep waiting until the window closes
  assert.equal(d(1_000_000_000n, 500), 'pay')
  assert.equal(d(1_500_000_000n, 1080), 'pay')          // inside the grace period; overpayment is returned at sweep
  assert.equal(d(1_000_000_000n, 1200), 'refund')       // full but late
  assert.equal(d(500_000_000n, 1200), 'refund')         // short after expiry
  assert.equal(d(1_000n, 1200), 'wait')                 // dust: not worth a refund
  assert.equal(d(0n, 1200), 'expire')
  assert.equal(d(1_000_000_000n, 5000, 'expired'), 'refund') // late money on an expired order still goes back
  assert.equal(d(0n, 1000 + 86_401, 'expired'), 'forget')
  assert.equal(d(1_000_000_000n, 500, 'paid'), 'none')  // settled orders are never re-decided
  assert.equal(d(1_000_000_000n, 500, 'stuck'), 'none')
})

test('one-time order keys are deterministic per order and differ between orders', () => {
  const seed = 'ab'.repeat(32)
  assert.equal(orderKeypair(seed, '01'.repeat(8)).publicKey.toBase58(), orderKeypair(seed, '01'.repeat(8)).publicKey.toBase58())
  assert.notEqual(orderKeypair(seed, '01'.repeat(8)).publicKey.toBase58(), orderKeypair(seed, '02'.repeat(8)).publicKey.toBase58())
  assert.notEqual(orderKeypair('cd'.repeat(32), '01'.repeat(8)).publicKey.toBase58(), orderKeypair(seed, '01'.repeat(8)).publicKey.toBase58())
})

test('cross-chain orders: never refunded on Solana; late or short deposits are repriced, then held', () => {
  const o = { via: 'x', refund: null, status: 'awaiting', lamports: '1000000000', expiresAt: 1000 }
  const d = (balance, now, extra = {}) => decideAddress({ ...o, ...extra }, { balance, now }).action
  assert.equal(d(1_000_000_000n, 500), 'pay')                       // full and on time: paid as quoted
  assert.equal(d(999_999_999n, 500), 'wait')                        // short but still inside the window
  assert.equal(d(1_000_000_000n, 1200), 'reprice')                  // full but late
  assert.equal(d(400_000_000n, 1200), 'reprice')                    // short after the window
  assert.equal(d(1_000_000_000n, 5000, { status: 'expired' }), 'reprice')
  assert.equal(d(1_000_000_000n, 1200, { nextTryAt: 1300 }), 'wait') // backing off between tries
  assert.equal(d(1_000_000_000n, 1300, { nextTryAt: 1300 }), 'reprice')
  assert.equal(d(1_000_000_000n, 1000 + X_GIVE_UP_SECS + 1, { status: 'expired' }), 'hold')
  assert.equal(d(1_000n, 1200), 'wait')                             // dust is ignored
  assert.equal(d(0n, 1200), 'expire')
  assert.equal(d(1_000_000_000n, 1200, { status: 'held' }), 'none')
  for (const now of [500, 1200, 5000, 200_000]) for (const bal of [0n, 5n, 400_000_000n, 2_000_000_000n]) for (const status of ['awaiting', 'expired'])
    assert.notEqual(d(bal, now, { status }), 'refund')              // there is no Solana address to refund to
  // an ordinary no-wallet order is untouched by any of this
  assert.equal(decideAddress({ status: 'awaiting', lamports: '1000000000', expiresAt: 1000, refund: 'x' }, { balance: 1_000_000_000n, now: 1200 }).action, 'refund')
})

test('reprice verdict: pay inside the limits, wait for reserve, keep watching when too small, hold when too large', () => {
  const base = { minPico: 10n, maxPico: 100n, free: 1000n, dailyLeft: 1000n }
  assert.equal(repriceVerdict({ ...base, xmrOut: 50n }), 'pay')
  assert.equal(repriceVerdict({ ...base, xmrOut: 9n }), 'small')   // too little so far: more may still arrive
  assert.equal(repriceVerdict({ ...base, xmrOut: 101n }), 'hold')
  assert.equal(repriceVerdict({ ...base, xmrOut: 50n, free: 49n }), 'wait')
  assert.equal(repriceVerdict({ ...base, xmrOut: 50n, dailyLeft: 49n }), 'wait')
  assert.equal(repriceVerdict({ ...base, xmrOut: 10n }), 'pay')
  assert.equal(repriceVerdict({ ...base, xmrOut: 100n }), 'pay')
})

// A fake solver around the real address-order code: one finalized balance per address, a wallet that records what it pays.
function fakeSolver({ xchain = true, xfloat = true, unlocked = 10_000_000_000_000n, rate = 200n, payFails = null } = {}) {
  const S = {}, paid = [], sent = [], balances = new Map()
  const C = { enabled: true, payouts: true, xchain, xfloat, xFloatTtl: 10_800, xFloatMaxOpen: 3, xMaxPico: 200_000_000_000n, maxPico: 500_000_000_000n, minPico: 10_000_000_000n, spreadBps: 60, addrExtraBps: 30, addrTtl: 900, addrMaxOpen: 40 }
  const boxKp = nacl.box.keyPair()
  const seal = (addr) => Buffer.from(sealAddress(addr, boxKp.publicKey)).toString('base64')
  const ctx = {
    S, C, save() {}, log() {}, store: { append() {} }, boxSecret: boxKp.secretKey, seedHex: 'ab'.repeat(32), limit() {},
    deposit: Keypair.generate().publicKey,
    price: async (lamports) => { if (ctx.priceDown) throw new Error('no price'); return BigInt(lamports) * BigInt(ctx.rate) },
    rate, priceDown: false,
    reservedXmr: () => 0n, dailyLeft: () => ctx.daily, daily: 10_000_000_000_000n,
    onPaid: (pico, lamports) => paid.push({ pico, lamports }),
    wallet: {
      balance: async () => ({ unlocked: ctx.unlocked, total: ctx.unlocked }),
      pay: async (address, pico) => { if (ctx.payFails) throw ctx.payFails; sent.push({ address, pico }); return { txHash: 'tx' + sent.length, txKey: 'k', fee: 1n } },
    },
    unlocked, payFails,
    conn: {
      getMultipleAccountsInfo: async (keys) => keys.map((k) => ({ lamports: Number(balances.get(k.toBase58()) || 0n) })),
      getLatestBlockhash: async () => { throw new Error('no chain in tests') }, // sweeps and refunds stop here, harmlessly
    },
  }
  const api = createAddressApi(ctx)
  return { api, ctx, S, sent, paid, balances, seal }
}
const XMR_ADDR = '42Fb6qKzN6dT475epTGdWUjWxesf24t2tDUn8r914XnNNGX8FzB5iJsTjGqK2FrADvSVotAuraZfF1hdimsfLhep13WySsg'
const realNow = Date.now

test('cross-chain order end to end: off by default, paid as quoted on time, repriced when late, held when it cannot be paid', async () => {
  // switched off: refused
  const off = fakeSolver({ xchain: false })
  await assert.rejects(off.api.create({ amount: '500000000', sealed: off.seal(XMR_ADDR), secretHash: 'a'.repeat(24), via: 'x', ip: '1' }), /not open yet/)

  // on time: exactly the quoted XMR, and no Solana refund address is stored
  const a = fakeSolver()
  await assert.rejects(a.api.create({ amount: '500000000', sealed: a.seal(XMR_ADDR), secretHash: 'a'.repeat(24), via: 'x', refund: Keypair.generate().publicKey.toBase58(), ip: '1' }), /no Solana refund/)
  await assert.rejects(a.api.create({ amount: '500000000', sealed: a.seal(XMR_ADDR), secretHash: 'a'.repeat(24), via: 'y', ip: '1' }), /bad order type/)
  await assert.rejects(a.api.create({ amount: '5000000000', sealed: a.seal(XMR_ADDR), secretHash: 'a'.repeat(24), via: 'x', ip: '1' }), /maximum/) // 1 XMR is above the cross-chain cap
  const o1 = await a.api.create({ amount: '500000000', sealed: a.seal(XMR_ADDR), secretHash: 'a'.repeat(24), via: 'x', ip: '1' })
  assert.equal(a.S.addr[o1.address].refund, null)
  assert.equal(a.S.addr[o1.address].via, 'x')
  a.balances.set(o1.address, 500_000_000n)
  await a.api.tick()
  assert.equal(a.S.addr[o1.address].status, 'paid')
  assert.deepEqual(a.sent, [{ address: XMR_ADDR, pico: 100_000_000_000n }])

  // late: paid for what arrived at the rate of that moment, never refunded
  const b = fakeSolver()
  const o2 = await b.api.create({ amount: '500000000', sealed: b.seal(XMR_ADDR), secretHash: 'b'.repeat(24), via: 'x', ip: '1' })
  b.balances.set(o2.address, 400_000_000n)            // short
  await b.api.tick()
  assert.equal(b.S.addr[o2.address].status, 'awaiting') // still inside the window: waits
  Date.now = () => realNow() + 1_200_000              // 20 minutes on
  b.ctx.rate = 150n                                   // the rate moved against the sender meanwhile
  await b.api.tick()
  Date.now = realNow
  const r2 = b.S.addr[o2.address]
  assert.equal(r2.status, 'paid')
  assert.equal(r2.xmrOut, String(400_000_000n * 150n))
  assert.deepEqual(r2.quoted, { lamports: '500000000', xmrOut: '100000000000' })
  assert.equal(b.sent.length, 1)
  assert.equal(b.sent[0].pico, 60_000_000_000n)
  assert.deepEqual(b.paid, [{ pico: 60_000_000_000n, lamports: 400_000_000n }]) // the books count what was really received

  // late and the reserve is empty: waits, then pays once there is XMR again; nothing is sent twice
  const c = fakeSolver()
  const o3 = await c.api.create({ amount: '500000000', sealed: c.seal(XMR_ADDR), secretHash: 'c'.repeat(24), via: 'x', ip: '1' })
  c.balances.set(o3.address, 500_000_000n)
  Date.now = () => realNow() + 1_200_000
  c.ctx.unlocked = 0n
  await c.api.tick()
  assert.equal(c.S.addr[o3.address].status, 'expired')
  assert.equal(c.sent.length, 0)
  await c.api.tick()                                  // backing off: not tried again yet
  assert.equal(c.sent.length, 0)
  c.ctx.unlocked = 10_000_000_000_000n
  Date.now = () => realNow() + 1_200_000 + 400_000
  await c.api.tick()
  assert.equal(c.S.addr[o3.address].status, 'paid')
  assert.equal(c.sent.length, 1)
  await c.api.tick()
  Date.now = realNow
  assert.equal(c.sent.length, 1)

  // a little dust arrives first, the real deposit late: the dust does not end the order; the real money is still paid
  const d = fakeSolver()
  const o4 = await d.api.create({ amount: '500000000', sealed: d.seal(XMR_ADDR), secretHash: 'd'.repeat(24), via: 'x', ip: '1' })
  d.balances.set(o4.address, 20_000_000n)
  Date.now = () => realNow() + 1_200_000
  await d.api.tick()
  assert.equal(d.S.addr[o4.address].status, 'expired')
  assert.equal(d.S.addr[o4.address].reason, 'less than the smallest order')
  assert.equal(d.S.addr[o4.address].wantPico, undefined)   // nothing is reserved for dust
  assert.equal(d.sent.length, 0)
  d.balances.set(o4.address, 520_000_000n)
  Date.now = () => realNow() + 1_200_000 + 400_000
  await d.api.tick()
  assert.equal(d.S.addr[o4.address].status, 'paid')
  assert.equal(d.sent[0].pico, 520_000_000n * 200n)
  // dust that never becomes an order: a human gets it after a day, nothing is ever sent
  Date.now = realNow
  const d2 = fakeSolver()
  const o4b = await d2.api.create({ amount: '500000000', sealed: d2.seal(XMR_ADDR), secretHash: 'd'.repeat(24), via: 'x', ip: '1' })
  d2.balances.set(o4b.address, 20_000_000n)
  Date.now = () => realNow() + (900 + X_GIVE_UP_SECS + 10) * 1000
  await d2.api.tick()
  Date.now = realNow
  assert.equal(d2.S.addr[o4b.address].status, 'held')
  assert.equal(d2.sent.length, 0)

  // far more than one order may be: held at once
  const big = fakeSolver()
  const o4c = await big.api.create({ amount: '500000000', sealed: big.seal(XMR_ADDR), secretHash: 'd'.repeat(24), via: 'x', ip: '1' })
  big.balances.set(o4c.address, 5_000_000_000n)
  Date.now = () => realNow() + 1_200_000
  await big.api.tick()
  Date.now = realNow
  assert.equal(big.S.addr[o4c.address].status, 'held')
  assert.equal(big.sent.length, 0)
})

const notSent = () => Object.assign(new Error('not enough unlocked money'), { walletMessage: 'not enough unlocked money' })

test('cross-chain: a deposit that was complete on time keeps its quoted rate while the payout is retried', async () => {
  const e = fakeSolver()
  const o = await e.api.create({ amount: '500000000', sealed: e.seal(XMR_ADDR), secretHash: 'e'.repeat(24), via: 'x', ip: '1' })
  e.balances.set(o.address, 500_000_000n)
  e.ctx.payFails = notSent()                            // the wallet's outputs are locked for a few minutes
  await e.api.tick()
  const r = e.S.addr[o.address]
  assert.equal(r.status, 'awaiting')                    // not refunded, not stuck, not thrown back to repricing
  assert.ok(r.fundedAt > 0)
  assert.equal(e.sent.length, 0)
  assert.equal(e.api.reserved(), 100_000_000_000n)      // its XMR stays reserved
  await e.api.tick()                                    // backing off
  assert.equal(e.sent.length, 0)
  e.ctx.payFails = null
  e.ctx.rate = 150n                                     // the rate moved against the customer meanwhile: irrelevant, they were on time
  Date.now = () => realNow() + 1_200_000                // 20 minutes on: past the 15-minute window
  await e.api.tick()
  assert.equal(r.status, 'paid')
  assert.deepEqual(e.sent, [{ address: XMR_ADDR, pico: 100_000_000_000n }]) // exactly the quoted XMR
  assert.equal(r.repriced, undefined)
  await e.api.tick()
  assert.equal(e.sent.length, 1)

  // ... but only for X_HONOUR_SECS: after that the deposit is paid at the rate of the moment
  Date.now = realNow
  const f = fakeSolver()
  const o2 = await f.api.create({ amount: '500000000', sealed: f.seal(XMR_ADDR), secretHash: 'f'.repeat(24), via: 'x', ip: '1' })
  f.balances.set(o2.address, 500_000_000n)
  f.ctx.payFails = notSent()
  Date.now = realNow
  await f.api.tick()
  f.ctx.payFails = null
  f.ctx.rate = 150n
  Date.now = () => realNow() + (900 + X_HONOUR_SECS + 200) * 1000
  await f.api.tick()
  Date.now = realNow
  assert.equal(f.S.addr[o2.address].status, 'paid')
  assert.equal(f.sent[0].pico, 500_000_000n * 150n)
  assert.equal(f.S.addr[o2.address].repriced, 'could not be paid at the quoted rate within an hour')
})

test('cross-chain: an unknown payout outcome is stuck for good; a bad address is held, never retried', async () => {
  const a = fakeSolver()
  const o = await a.api.create({ amount: '500000000', sealed: a.seal(XMR_ADDR), secretHash: 'a'.repeat(24), via: 'x', ip: '1' })
  a.balances.set(o.address, 400_000_000n)
  Date.now = () => realNow() + 1_200_000
  a.ctx.payFails = new Error('socket hang up')          // sent or not? nobody knows
  await a.api.tick()
  assert.equal(a.S.addr[o.address].status, 'stuck')
  assert.equal(a.S.addr[o.address].repriced, undefined) // it does not claim to have been paid
  a.ctx.payFails = null
  for (let i = 0; i < 3; i++) { Date.now = () => realNow() + 1_200_000 + (i + 1) * 600_000; await a.api.tick() }
  assert.equal(a.sent.length, 0)                        // never tried again by itself
  assert.equal(a.S.addr[o.address].status, 'stuck')

  const b = fakeSolver()
  const o2 = await b.api.create({ amount: '500000000', sealed: b.seal(XMR_ADDR), secretHash: 'b'.repeat(24), via: 'x', ip: '1' })
  b.balances.set(o2.address, 500_000_000n)
  Date.now = realNow
  b.ctx.payFails = Object.assign(new Error('bad'), { walletMessage: 'Invalid destination address' })
  await b.api.tick()
  assert.equal(b.S.addr[o2.address].status, 'held')
  Date.now = realNow
})

test('cross-chain: a funded order waiting for XMR keeps it reserved, and stops at the daily limit without paying', async () => {
  const c = fakeSolver()
  const o = await c.api.create({ amount: '500000000', sealed: c.seal(XMR_ADDR), secretHash: 'c'.repeat(24), via: 'x', ip: '1' })
  c.balances.set(o.address, 500_000_000n)
  Date.now = () => realNow() + 1_200_000
  c.ctx.daily = 0n                                      // today's limit is used up
  await c.api.tick()
  const r = c.S.addr[o.address]
  assert.equal(r.status, 'expired')
  assert.equal(r.reason, 'waiting for XMR to be available')
  assert.equal(r.received, '500000000')
  assert.equal(c.api.reserved(), 100_000_000_000n)      // reserved while it waits ...
  assert.equal(c.api.reserved(o.address), 0n)           // ... but not against itself
  assert.equal(c.sent.length, 0)
  c.ctx.daily = 10_000_000_000_000n
  Date.now = () => realNow() + 1_200_000 + 400_000
  await c.api.tick()
  Date.now = realNow
  assert.equal(r.status, 'paid')
  assert.equal(r.wantPico, undefined)
  assert.equal(c.api.reserved(), 0n)
})

test('cross-chain: money that arrives after an order was closed is found and handed to a human', async () => {
  const a = fakeSolver()
  const o = await a.api.create({ amount: '500000000', sealed: a.seal(XMR_ADDR), secretHash: 'a'.repeat(24), via: 'x', ip: '1' })
  Date.now = () => realNow() + 1_200_000
  await a.api.tick()
  assert.equal(a.S.addr[o.address].status, 'expired')   // nothing came
  Date.now = () => realNow() + (900 + 86_400 + 100) * 1000
  await a.api.tick()
  assert.equal(a.S.addr[o.address].status, 'closed')
  a.balances.set(o.address, 500_000_000n)               // two days later, money lands
  Date.now = () => realNow() + 3 * 86_400_000
  for (let i = 0; i < 25; i++) await a.api.tick()       // the late scan runs every 20th pass
  Date.now = realNow
  assert.equal(a.S.addr[o.address].status, 'held')
  assert.equal(a.sent.length, 0)
})

test('ordinary no-wallet orders: a wallet that cannot pay, or a short reserve, still means a refund', async () => {
  for (const setup of [(s) => { s.ctx.payFails = notSent() }, (s) => { s.ctx.unlocked = 0n }]) {
    const a = fakeSolver()
    const refund = Keypair.generate().publicKey.toBase58()
    const o = await a.api.create({ amount: '500000000', sealed: a.seal(XMR_ADDR), secretHash: 'a'.repeat(24), refund, ip: '1' })
    a.balances.set(o.address, 500_000_000n)
    setup(a)
    await a.api.tick()
    assert.equal(a.S.addr[o.address].status, 'refund_pending')
    assert.equal(a.S.addr[o.address].fundedAt, undefined)
    assert.equal(a.sent.length, 0)
  }
})

test('an ordinary no-wallet order still needs a Solana refund address and still refunds', async () => {
  const a = fakeSolver()
  await assert.rejects(a.api.create({ amount: '500000000', sealed: a.seal(XMR_ADDR), secretHash: 'a'.repeat(24), ip: '1' }), /Solana address for refunds/)
  const refund = Keypair.generate().publicKey.toBase58()
  const o = await a.api.create({ amount: '500000000', sealed: a.seal(XMR_ADDR), secretHash: 'a'.repeat(24), refund, ip: '1' })
  assert.equal(a.S.addr[o.address].refund, refund)
  assert.equal(a.S.addr[o.address].via, undefined)
  a.balances.set(o.address, 400_000_000n)
  Date.now = () => realNow() + 1_200_000
  await a.api.tick()
  Date.now = realNow
  assert.equal(a.sent.length, 0)                       // short and late: no XMR is sent
  assert.equal(a.S.addr[o.address].reason, 'less SOL than quoted') // it went down the refund path (the test chain stops the transfer itself)
})

test('floating orders (slow chains): decided on arrival, never on a clock, never refunded', () => {
  const o = { via: 'x', float: true, refund: null, status: 'awaiting', lamports: '1000000000', expiresAt: 10_000 }
  const d = (balance, now, extra = {}) => decideAddress({ ...o, ...extra }, { balance, now }).action
  assert.equal(d(0n, 500), 'wait')
  assert.equal(d(1_000n, 500), 'wait')                               // dust
  assert.equal(d(700_000_000n, 500), 'reprice')                      // whatever arrives is priced at once, early ...
  assert.equal(d(1_300_000_000n, 9_000), 'reprice')
  assert.equal(d(700_000_000n, 50_000), 'reprice')                   // ... or hours late
  assert.equal(d(700_000_000n, 500, { nextTryAt: 800 }), 'wait')
  assert.equal(d(700_000_000n, 10_000 + X_GIVE_UP_SECS + 1), 'hold')
  assert.equal(d(0n, 10_200), 'expire')
  assert.equal(d(0n, 10_000 + 86_401, { status: 'expired' }), 'forget')
  for (const now of [1, 9_999, 20_000, 200_000]) for (const bal of [0n, 5n, 700_000_000n, 3_000_000_000n]) for (const status of ['awaiting', 'expired']) {
    const a = d(bal, now, { status })
    assert.notEqual(a, 'refund'); assert.notEqual(a, 'pay')          // 'pay' would mean a locked rate; there is none
  }
})

test('floating order end to end: its own switch, reserves nothing, pays what arrived at the rate of that moment', async () => {
  const off = fakeSolver({ xfloat: false })
  await assert.rejects(off.api.create({ amount: '500000000', sealed: off.seal(XMR_ADDR), secretHash: 'a'.repeat(24), via: 'x', float: true, ip: '1' }), /not open yet/)
  const a = fakeSolver()
  await assert.rejects(a.api.create({ amount: '500000000', sealed: a.seal(XMR_ADDR), secretHash: 'a'.repeat(24), float: true, refund: Keypair.generate().publicKey.toBase58(), ip: '1' }), /bad order type/) // only cross-chain orders float
  await assert.rejects(a.api.create({ amount: '500000000', sealed: a.seal(XMR_ADDR), secretHash: 'a'.repeat(24), via: 'x', float: 'yes', ip: '1' }), /bad order type/)
  Date.now = realNow
  const o = await a.api.create({ amount: '500000000', sealed: a.seal(XMR_ADDR), secretHash: 'a'.repeat(24), via: 'x', float: true, ip: '1' })
  const r = a.S.addr[o.address]
  assert.equal(r.float, true)
  assert.equal(o.expiresAt - r.createdAt, 10_800)                    // open for hours, not minutes
  assert.equal(a.api.reserved(), 0n)                                 // nothing is held back for it
  await a.api.tick()
  assert.equal(r.status, 'awaiting')
  // 80 minutes later the money lands, a different amount than expected, at a different rate
  a.balances.set(o.address, 430_000_000n)
  a.ctx.rate = 180n
  Date.now = () => realNow() + 4_800_000
  await a.api.tick()
  assert.equal(r.status, 'paid')
  assert.deepEqual(a.sent, [{ address: XMR_ADDR, pico: 430_000_000n * 180n }])
  assert.equal(r.repriced, undefined)                                // no rate was promised, so nothing was "repriced"
  assert.deepEqual(a.paid, [{ pico: 430_000_000n * 180n, lamports: 430_000_000n }])
  await a.api.tick()
  assert.equal(a.sent.length, 1)

  // no XMR available when it lands: waits with its XMR reserved, then pays; an unknown outcome is stuck for good
  const b = fakeSolver()
  Date.now = realNow
  const o2 = await b.api.create({ amount: '500000000', sealed: b.seal(XMR_ADDR), secretHash: 'b'.repeat(24), via: 'x', float: true, ip: '1' })
  b.balances.set(o2.address, 500_000_000n)
  b.ctx.unlocked = 0n
  await b.api.tick()
  assert.equal(b.S.addr[o2.address].status, 'expired')
  assert.equal(b.api.reserved(), 100_000_000_000n)
  b.ctx.unlocked = 10_000_000_000_000n
  b.ctx.payFails = new Error('socket hang up')
  Date.now = () => realNow() + 400_000
  await b.api.tick()
  assert.equal(b.S.addr[o2.address].status, 'stuck')
  b.ctx.payFails = null
  Date.now = () => realNow() + 900_000
  await b.api.tick()
  assert.equal(b.sent.length, 0)

  // floating orders have their own open-order limit and do not use up the ordinary one
  const c = fakeSolver()
  Date.now = realNow
  for (let i = 0; i < 3; i++) await c.api.create({ amount: '500000000', sealed: c.seal(XMR_ADDR), secretHash: String(i).repeat(24), via: 'x', float: true, ip: '1' })
  await assert.rejects(c.api.create({ amount: '500000000', sealed: c.seal(XMR_ADDR), secretHash: '9'.repeat(24), via: 'x', float: true, ip: '1' }), /Too many open orders/)
  await c.api.create({ amount: '500000000', sealed: c.seal(XMR_ADDR), secretHash: '8'.repeat(24), via: 'x', ip: '1' }) // a fixed-rate one still fits
  Date.now = realNow
})

test('money that reaches a settled one-time address later is flagged for a human and never paid again', async () => {
  const a = fakeSolver()
  Date.now = realNow
  const o = await a.api.create({ amount: '500000000', sealed: a.seal(XMR_ADDR), secretHash: 'a'.repeat(24), via: 'x', ip: '1' })
  a.balances.set(o.address, 500_000_000n)
  await a.api.tick()
  const r = a.S.addr[o.address]
  assert.equal(r.status, 'paid')
  r.swept = true                                                     // (the test chain cannot sweep) the address was emptied ...
  a.balances.set(o.address, 0n)
  a.balances.set(o.address, 600_000_000n)                            // ... and an hour later more money lands on it
  Date.now = () => realNow() + 3_600_000
  for (let i = 0; i < 25; i++) await a.api.tick()
  Date.now = realNow
  assert.equal(r.status, 'paid')                                     // it stays what it was
  assert.equal(r.lateFunds, '600000000')                             // and a human is told
  assert.equal(a.sent.length, 1)                                     // nothing more was sent
})

test('signed promise: readable, bound to the sealed address, checkable with the deposit wallet key alone', () => {
  const kp = nacl.sign.keyPair()
  const f = { order: 'ab12cd34ef56ab12', send: '1000000000', to: 'Dep1111111111111111111111111111111111111111', xmrOut: '20753000000', sealed: 'c2VhbGVk', expiresAt: 1800000000, refund: 'Snd1111111111111111111111111111111111111111', signer: 'Dep1111111111111111111111111111111111111111' }
  const text = promiseText(f)
  assert.match(text, /^Nero order promise v1\n/)
  assert.match(text, /you get: 20753000000 piconero \(0\.020753000000 XMR\)/)
  assert.match(text, /refunded to Snd1/)
  const sig = nacl.sign.detached(Buffer.from(text), kp.secretKey)
  assert.ok(nacl.sign.detached.verify(Buffer.from(text), sig, kp.publicKey))
  // any change to the promise breaks the signature, including which sealed address it is for
  const other = promiseText({ ...f, sealed: 'b3RoZXI=' })
  assert.notEqual(other, text)
  assert.ok(!nacl.sign.detached.verify(Buffer.from(other), sig, kp.publicKey))
  assert.match(promiseText({ ...f, refund: null }), /never kept/)
})
