// Nero solver. Pays real XMR from our own Monero wallet for SOL sent to the deposit wallet with a sealed order.
//   HTTP :3097  GET /v2/info · GET /v2/quote · POST /v2/check · GET /v2/order · GET /v2/node · POST /v2/promise/verify
//   loop        watch deposits -> decide -> pay XMR (finalized deposits only) or refund SOL; every send is booked
//               before it goes out and never retried blindly; anything ambiguous becomes 'stuck' for a human.
// The browser builds the order transaction itself (Jupiter + transfer + memo); this service never hands out a
// transaction to sign. Kill switches: SOLVER_ENABLED=0 stops quotes, PAYOUTS_ENABLED=0 stops every send.
import http from 'http'
import { randomBytes, timingSafeEqual } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { connect, loadKeypair, buildTx, simulate, sendSafe } from './lib/chain.js'
import { createStore } from './lib/store.js'
import { quote as jupQuote } from './lib/jup.js'
import { WXMR_MINT, BRIDGE_PROGRAM } from './lib/bridge.js'
import { checkMoneroAddress } from './lib/monero.js'
import { promiseText, applyRate, decide, fairPico, formatMemo, openAddress, oraclePico, parseMemo, priceWithSpread, quoteLimit, rateBucket, refundLamports, secretHash, splitPlan } from './core.js'
import { walletRpc, definitelyNotSent } from './xmr.js'
import { rebalance } from './rebalance.js'
import { createAddressApi } from './address.js'

const DIR = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
for (const f of [DIR + '.env']) if (existsSync(f)) for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2] }
const env = process.env, num = (k, d) => (env[k] ? Number(env[k]) : d), big = (k, d) => BigInt(env[k] || d)
const C = {
  port: num('SOLVER_PORT', 3097), rpc: env.RPC_URL || 'https://api.mainnet-beta.solana.com',
  enabled: env.SOLVER_ENABLED === '1', payouts: env.PAYOUTS_ENABLED !== '0', rebalanceLive: env.REBALANCE_LIVE === '1',
  spreadBps: num('SPREAD_BPS', 60), ttl: num('QUOTE_TTL', 60),
  minPico: big('MIN_XMR_PICO', 10_000_000_000), maxPico: big('MAX_ORDER_PICO', 1_000_000_000_000), dailyPico: big('DAILY_CAP_PICO', 10_000_000_000_000),
  gasReserve: big('GAS_RESERVE_LAMPORTS', 50_000_000),
  oracleMaxGap: num('ORACLE_MAX_GAP_BPS', 300), // pool vs oracle gap that stops quoting altogether
  rateCacheMs: num('RATE_CACHE_MS', 6000),
  staleRefundSecs: num('STALE_REFUND_SECS', 3600), // refunds for deposits older than this go to a human
  // no-connect orders (one-time deposit address): a longer lock, so a slightly wider fee
  addrTtl: num('ADDR_TTL', 900), addrExtraBps: num('ADDR_EXTRA_BPS', 30), addrMaxOpen: num('ADDR_MAX_OPEN', 40),
  // exits from other chains (a route provider delivers SOL to a one-time address): off unless switched on, and capped lower
  xchain: env.XCHAIN_ENABLED === '1', xMaxPico: big('XCHAIN_MAX_PICO', 200_000_000_000),
  // slow chains (Bitcoin, Zcash, ...): no locked rate, priced when the SOL arrives. Its own switch, off unless set.
  xfloat: env.XCHAIN_ENABLED === '1' && env.XCHAIN_FLOAT_ENABLED === '1', xFloatTtl: num('XCHAIN_FLOAT_TTL', 10_800), xFloatMaxOpen: num('XCHAIN_FLOAT_MAX_OPEN', 150),
}
const SOL = 'So11111111111111111111111111111111111111112'
// the commit of this code, set at deploy time, so anyone can compare it with the public repository
const VERSION = env.NERO_COMMIT || (existsSync(DIR + 'COMMIT') ? readFileSync(DIR + 'COMMIT', 'utf8').trim() : 'dev')
const DAEMON = env.DAEMON_URL || 'http://127.0.0.1:18081'
const MEMO_PROGRAMS = new Set(['MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo'])

const log = (...a) => console.log(new Date().toISOString(), ...a)
const conn = connect(C.rpc)
const depositKp = loadKeypair(env.SOLVER_KEY_FILE)
const deposit = depositKp.publicKey
const boxSecret = new Uint8Array(Buffer.from(env.SOLVER_BOX_SECRET, 'base64'))
const boxPub = nacl.box.keyPair.fromSecretKey(boxSecret).publicKey
/*
  Every order comes with a promise signed by the deposit wallet's own key: what you send, what you get, until when.
  The deposit wallet is public, so anyone can check the signature. If we ever failed to pay or refund, the person
  holding the promise can prove it to everyone.
*/
const promise = (fields) => {
  const text = promiseText({ ...fields, signer: deposit.toBase58() })
  return { text, signature: bs58.encode(nacl.sign.detached(Buffer.from(text, 'utf8'), depositKp.secretKey)) }
}
const wallet = walletRpc({ url: env.WALLET_RPC_URL || 'http://127.0.0.1:18083/json_rpc', file: env.WALLET_FILE || 'solver', user: env.WALLET_RPC_USER, pass: env.WALLET_RPC_PASS, filePass: env.WALLET_PASS })
const store = createStore(env.SOLVER_DATA || DIR + 'data/')

// A missing state file must never mean "start from scratch": that would re-handle (refund) every past deposit,
// including ones already paid in XMR. First start needs SOLVER_INIT=1, which begins at the newest signature.
if (!existsSync(store.path('state.json')) && env.SOLVER_INIT !== '1') { console.error('state.json missing: refusing to start (first run: SOLVER_INIT=1)'); process.exit(1) }
const S = { quotes: {}, orders: {}, lastSig: null, daily: { day: '', pico: '0' }, earnedLamports: '0', rebalancedLamports: '0', ...store.readJson('state.json', {}) }
const save = () => store.writeJson('state.json', S)
let addrApi = null
if (!existsSync(store.path('state.json'))) {
  const newest = await conn.getSignaturesForAddress(deposit, { limit: 1 }, 'confirmed')
  S.lastSig = newest[0]?.signature || null
  S.initAt = new Date().toISOString()
  log('initialized at', S.lastSig || '(no history)')
}

// a crash in the middle of a send leaves 'paying' / 'refunding': never guess, stop and wait for a human
for (const o of [...Object.values(S.orders), ...Object.values(S.addr || {})]) if (o.status === 'paying' || o.status === 'refunding') { o.note = `was ${o.status} at restart`; o.status = 'stuck'; log('STUCK after restart', o.sig, o.note) }
save()

/* ---------------- money helpers ---------------- */

const today = () => new Date().toISOString().slice(0, 10)
const dailyLeft = () => (S.daily.day === today() ? C.dailyPico - BigInt(S.daily.pico) : C.dailyPico)
// XMR held back for orders we committed to: checked quotes still inside their window, and payouts in flight
function reserved(now = Date.now() / 1000, except = null, exceptAddr = null) {
  let r = 0n
  for (const q of Object.values(S.quotes)) if (q.checked && !q.used && q.id !== except && q.expiresAt + 120 > now) r += BigInt(q.xmrOut)
  for (const o of Object.values(S.orders)) if (o.status === 'paying') r += BigInt(o.xmrOut)
  return r + (addrApi ? addrApi.reserved(exceptAddr) : 0n)
}
async function freeXmr() { const b = await wallet.balance(); return { ...b, free: b.unlocked - reserved() } }

// Independent price for the cross-check: two public USD feeds, cached a minute.
let oracle = { at: 0, sol: 0, xmr: 0 }
async function oraclePrices() {
  if (Date.now() - oracle.at < 60_000 && oracle.sol > 0) return oracle
  const tries = [
    async () => { const j = await (await fetch('https://api.coingecko.com/api/v3/simple/price?ids=monero,solana&vs_currencies=usd', { signal: AbortSignal.timeout(8000) })).json(); return { sol: j.solana.usd, xmr: j.monero.usd } },
    async () => { const j = await (await fetch('https://min-api.cryptocompare.com/data/pricemulti?fsyms=SOL,XMR&tsyms=USD', { signal: AbortSignal.timeout(8000) })).json(); return { sol: j.SOL.USD, xmr: j.XMR.USD } },
  ]
  for (const t of tries) { try { const p = await t(); if (p.sol > 0 && p.xmr > 0) return (oracle = { at: Date.now(), ...p }) } catch {} }
  throw Object.assign(new Error('No reference price right now. Try again in a minute.'), { status: 503 })
}

/** XMR (pico) we promise for `lamports` of SOL: the lower of the pool and the oracle, minus our spread. */
// The pool rate is cached for a few seconds per size bucket, so a crowd asking for quotes does not turn into a
// crowd of router requests. The oracle cross-check still runs on every quote.
const rates = new Map()
async function poolPico(lamports) {
  const key = rateBucket(lamports), hit = rates.get(key)
  if (hit && Date.now() - hit.at < C.rateCacheMs) return applyRate(lamports, hit)
  let mq
  try { mq = await jupQuote({ inputMint: SOL, outputMint: WXMR_MINT.toBase58(), amount: lamports, slippageBps: 50 }) }
  catch (e) {
    if (hit && Date.now() - hit.at < 60_000) return applyRate(lamports, hit)
    log('no pool rate:', e.message)
    throw Object.assign(new Error('No price right now. Try again in a moment.'), { status: 503 })
  }
  rates.set(key, { at: Date.now(), inLamports: String(lamports), outPico: mq.outAmount })
  return BigInt(mq.outAmount)
}
async function price(lamports, spreadBps) {
  const pool = await poolPico(lamports)
  const px = await oraclePrices()
  const ref = oraclePico(lamports, px.sol, px.xmr)
  const gap = Number(((pool - ref) * 10_000n) / (ref || 1n))
  if (Math.abs(gap) > C.oracleMaxGap) { log('quote refused: pool vs oracle gap', gap, 'bps'); throw Object.assign(new Error('Prices are moving fast. Try again in a minute.'), { status: 503 }) }
  return priceWithSpread(fairPico(pool, ref), spreadBps)
}

/* ---------------- quotes ---------------- */

// cheap abuse limits: quotes per IP per minute, open quotes per wallet
const hits = new Map()
function limit(key, max, windowMs) {
  const now = Date.now(), arr = (hits.get(key) || []).filter((t) => now - t < windowMs)
  if (arr.length >= max) throw Object.assign(new Error('Too many quotes. Wait a moment.'), { status: 429 })
  arr.push(now); hits.set(key, arr)
}

async function makeQuote({ inputMint, amount, wallet: user, ip }) {
  if (!C.enabled) throw Object.assign(new Error('The private exit is not open yet'), { status: 503 })
  try { new PublicKey(user) } catch { throw Object.assign(new Error('Connect a wallet to get a quote'), { status: 400 }) }
  if (!/^\d{1,20}$/.test(String(amount || ''))) throw Object.assign(new Error('bad amount'), { status: 400 })
  limit('ip:' + ip, 30, 60_000)
  limit('w:' + user, 6, 60_000)
  let lamports, swapQuote = null
  if (inputMint === SOL) lamports = BigInt(amount)
  else {
    // smallest route that exists, so the order transaction leaves room for the wallet's own guard instruction
    // (a bonding-curve coin needs a bigger account budget than an AMM pair; the browser re-checks the final size)
    for (const maxAccounts of [24, 32, 40]) {
      try { swapQuote = await jupQuote({ inputMint, outputMint: SOL, amount, slippageBps: 100, maxAccounts }); break }
      catch (e) {
        if (/not tradable|cannot be traded|invalid .*mint|token not found/i.test(e.message)) throw Object.assign(new Error('This token cannot be traded right now. Check the address, or pick another token.'), { status: 400 })
        if (!/no routes? found|could not find any route/i.test(e.message)) throw e
      }
    }
    if (!swapQuote) throw Object.assign(new Error('No route for this token right now. Try another token or amount.'), { status: 400 })
    if (swapQuote.platformFee && Number(swapQuote.platformFee.amount) > 0) throw new Error('unexpected platform fee')
    lamports = BigInt(swapQuote.otherAmountThreshold) // the transfer carries the swap's guaranteed minimum
  }
  const xmrOut = await price(lamports, C.spreadBps)
  const { free } = env.DEV_SKIP_BALANCE === '1' ? { free: C.maxPico } : await freeXmr()
  const why = quoteLimit({ xmrOut, free, minPico: C.minPico, maxPico: C.maxPico, dailyLeft: dailyLeft() })
  if (why) throw Object.assign(new Error(why), { status: 400 })
  const id = randomBytes(8).toString('hex')
  const now = Math.floor(Date.now() / 1000)
  // kept in memory until /check; only checked quotes reserve XMR and are written to disk
  S.quotes[id] = { id, wallet: user, inputMint, amountIn: String(amount), lamports: String(lamports), xmrOut: String(xmrOut), expiresAt: now + C.ttl, createdAt: now, used: false, checked: false }
  return { quoteId: id, lamports: String(lamports), xmrOut: String(xmrOut), expiresAt: now + C.ttl, deposit: deposit.toBase58(), swapQuote }
}

// The browser sends the sealed address before it builds the transaction: we confirm it opens to a valid Monero
// address (so nobody signs an order we would have to refund), reserve the XMR, and persist the quote.
async function checkOrder({ quoteId, sealed, secretHash: sh }) {
  const q = S.quotes[quoteId]
  if (!q || q.used) throw Object.assign(new Error('Quote not found. Get a new quote.'), { status: 400 })
  if (q.expiresAt - 10 < Date.now() / 1000) throw Object.assign(new Error('Quote expired. Get a new quote.'), { status: 400 })
  if (!/^[0-9a-f]{24}$/.test(sh || '')) throw Object.assign(new Error('bad secret hash'), { status: 400 })
  if (typeof sealed !== 'string' || !/^[A-Za-z0-9+/=]{150,180}$/.test(sealed)) throw Object.assign(new Error('bad sealed address'), { status: 400 })
  const address = openAddress(sealed, boxSecret)
  const chk = address ? checkMoneroAddress(address) : { ok: false, reason: 'The sealed address could not be opened' }
  if (!chk.ok) throw Object.assign(new Error(chk.reason), { status: 400 })
  const memo = formatMemo(quoteId, sh, Buffer.from(sealed, 'base64'))
  if (!parseMemo(memo)) throw Object.assign(new Error('order too large'), { status: 400 })
  if (!q.checked) {
    const { unlocked } = env.DEV_SKIP_BALANCE === '1' ? { unlocked: C.maxPico * 10n } : await wallet.balance()
    if (unlocked - reserved(Date.now() / 1000, q.id) < BigInt(q.xmrOut)) throw Object.assign(new Error('Not enough XMR available for this order right now. Try a smaller amount.'), { status: 400 })
    q.checked = true
    save()
  }
  return { ok: true, memo, lamports: q.lamports, deposit: deposit.toBase58(), promise: promise({ order: q.id, send: q.lamports, to: deposit.toBase58(), xmrOut: q.xmrOut, sealed, expiresAt: q.expiresAt, refund: q.wallet }) }
}

// no-connect orders: one-time deposit addresses derived from SOLVER_ADDR_SEED
if (!/^[0-9a-f]{64}$/.test(env.SOLVER_ADDR_SEED || '')) { console.error('SOLVER_ADDR_SEED (64 hex) is required'); process.exit(1) }
addrApi = createAddressApi({
  S, C, conn, wallet, save, log, store, boxSecret, seedHex: env.SOLVER_ADDR_SEED, deposit, price, limit, dailyLeft,
  reservedXmr: (exceptAddr = null) => reserved(undefined, null, exceptAddr),
  onPaid: (xmrPico, lamports) => {
    if (S.daily.day !== today()) S.daily = { day: today(), pico: '0' }
    S.daily.pico = String(BigInt(S.daily.pico) + xmrPico)
    S.earnedLamports = String(BigInt(S.earnedLamports) + lamports)
  },
})

/* ---------------- the watcher ---------------- */

function readDeposit(tx) {
  const keys = tx.transaction.message.accountKeys.map((k) => (k.pubkey ? k.pubkey.toBase58() : k.toBase58()))
  const di = keys.indexOf(deposit.toBase58())
  const sender = keys[0]
  if (di < 0 || sender === deposit.toBase58() || tx.meta.err) return { lamportsIn: 0n, sender }
  const lamportsIn = BigInt(tx.meta.postBalances[di]) - BigInt(tx.meta.preBalances[di])
  // the bridge closing our own refill records returns their rent here: that is ours, not an order
  if (tx.transaction.message.instructions.some((ix) => ix.programId.equals(BRIDGE_PROGRAM))) return { lamportsIn: 0n, sender }
  let memo = null
  for (const ix of tx.transaction.message.instructions) {
    if (MEMO_PROGRAMS.has(ix.programId.toBase58()) && typeof ix.parsed === 'string') memo = parseMemo(ix.parsed) || memo
  }
  return { lamportsIn, sender, memo }
}

async function handle(sig) {
  if (S.orders[sig]) return
  const tx = await conn.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' })
  if (!tx) throw new Error(`tx ${sig} not visible yet`)
  const d = readDeposit(tx)
  if (addrApi.isOurs(d.sender)) return // a sweep from one of our own one-time order addresses
  const q = d.memo ? S.quotes[d.memo.quoteId] : undefined
  const address = d.memo ? openAddress(d.memo.sealed, boxSecret) : null
  const { unlocked } = await wallet.balance()
  const avail = unlocked - reserved(Date.now() / 1000, q?.id)
  const dec = decide({ ...d, blockTime: tx.blockTime, quote: q, address, unlocked: avail, dailyLeft: dailyLeft(), alreadySeen: false })
  if (dec.action === 'ignore') return
  if (!C.payouts) throw new Error('payouts paused (PAYOUTS_ENABLED=0): holding at ' + sig)
  const o = { sig, sender: d.sender, lamportsIn: String(d.lamportsIn), quoteId: d.memo?.quoteId || null, secretHash: d.memo?.secretHash || null, xmrOut: q?.xmrOut || '0', blockTime: tx.blockTime, at: Math.floor(Date.now() / 1000) }
  if (dec.action === 'hold') { S.orders[sig] = { ...o, status: 'held', reason: dec.reason }; save(); log('HELD (no order memo)', sig, String(d.lamportsIn)); return }
  if (dec.action === 'refund') {
    if (dec.burnQuote) q.used = true
    S.orders[sig] = { ...o, status: 'refund_pending', reason: dec.reason, tries: 0 }; save(); log('refund queued', sig, dec.reason); return
  }
  // pay: XMR cannot be taken back, so only against a finalized deposit (a later tick retries until it is)
  const st = (await conn.getSignatureStatuses([sig], { searchTransactionHistory: true })).value[0]
  if (st?.confirmationStatus !== 'finalized') throw new Error(`waiting for ${sig} to finalize`)
  q.used = true
  S.orders[sig] = { ...o, status: 'paying' }
  save()
  try {
    const r = await wallet.pay(address, BigInt(q.xmrOut))
    Object.assign(S.orders[sig], { status: 'paid', xmrTx: r.txHash, txKey: r.txKey, xmrFee: r.fee, paidAt: Math.floor(Date.now() / 1000) })
    if (S.daily.day !== today()) S.daily = { day: today(), pico: '0' }
    S.daily.pico = String(BigInt(S.daily.pico) + BigInt(q.xmrOut))
    S.earnedLamports = String(BigInt(S.earnedLamports) + BigInt(o.lamportsIn))
    store.append('paid.jsonl', { sig, xmrOut: q.xmrOut, xmrTx: r.txHash })
    log('PAID', sig, q.xmrOut, 'pico ->', r.txHash)
  } catch (e) {
    if (definitelyNotSent(e)) { Object.assign(S.orders[sig], { status: 'refund_pending', reason: 'payout failed: ' + e.walletMessage, tries: 0 }); log('payout refused, refunding', sig, e.walletMessage) }
    else { Object.assign(S.orders[sig], { status: 'stuck', note: 'payout outcome unknown: ' + String(e.message).slice(0, 300) }); log('STUCK payout outcome unknown', sig, e.message) }
  }
  save()
}

async function refunds() {
  const now = Math.floor(Date.now() / 1000)
  for (const o of Object.values(S.orders)) {
    if (o.status !== 'refund_pending') continue
    const amt = refundLamports(BigInt(o.lamportsIn))
    if (amt === 0n) { o.status = 'ignored_dust'; save(); continue }
    if (o.blockTime && now - o.blockTime > C.staleRefundSecs) { o.status = 'stuck'; o.note = 'refund for an old deposit: check by hand'; save(); continue }
    let built
    try {
      built = await buildTx(conn, deposit, [SystemProgram.transfer({ fromPubkey: deposit, toPubkey: new PublicKey(o.sender), lamports: amt })], [depositKp], { units: 20_000, microLamports: 50_000 })
      const sim = await simulate(conn, built.tx)
      if (!sim.ok) { o.status = 'stuck'; o.note = 'refund would fail: ' + JSON.stringify(sim.err); save(); log('refund would fail', o.sig, JSON.stringify(sim.err)); continue }
    } catch (e) { log('refund build error (will retry)', o.sig, e.message); continue } // nothing was sent
    o.status = 'refunding'; o.tries = (o.tries || 0) + 1; save()
    const r = await sendSafe(conn, built)
    if (r.status === 'confirmed') { o.status = 'refunded'; o.refundSig = r.sig; store.append('refunds.jsonl', { sig: o.sig, lamports: String(amt), refundSig: r.sig, reason: o.reason }); log('REFUNDED', o.sig, String(amt)) }
    else if (r.status === 'not_landed' && o.tries < 3) o.status = 'refund_pending' // provably never landed: safe to try again
    else { o.status = 'stuck'; o.note = `refund ${r.status}: ${r.sig}` } // failed on-chain or unknown: a human looks
    save()
  }
}

// our own Monero node, read live: its height, whether it is in sync, and the wallet's height on top of it
let nodeCache = { at: 0, v: null }
async function nodeInfo() {
  if (nodeCache.v && Date.now() - nodeCache.at < 15_000) return nodeCache.v
  const j = await (await fetch(`${DAEMON}/get_info`, { signal: AbortSignal.timeout(6000) })).json()
  // the wallet can be busy refreshing; its height is a nice-to-have here, never worth holding the node status for
  const walletHeight = await Promise.race([wallet.height(), new Promise((r) => setTimeout(() => r(null), 2000))]).catch(() => null)
  const v = {
    height: j.height, targetHeight: Math.max(j.target_height || 0, j.height), synchronized: !!j.synchronized && !j.busy_syncing,
    topBlockHash: j.top_block_hash, version: j.version || null, nettype: j.nettype, outgoing: j.outgoing_connections_count, incoming: j.incoming_connections_count,
    walletHeight, at: Math.floor(Date.now() / 1000),
  }
  nodeCache = { at: Date.now(), v }
  return v
}

let busy = false, lastRebalance = 0, lastSplit = 0, addrTick = 0
let reserveCache = { at: 0, pico: null }
async function tick() {
  if (busy) return
  busy = true
  try {
    // every signature since the last one handled, oldest first (paged, so a burst can't skip any)
    const sigs = []
    for (let before; ;) {
      const page = await conn.getSignaturesForAddress(deposit, { limit: 1000, ...(S.lastSig ? { until: S.lastSig } : {}), ...(before ? { before } : {}) }, 'confirmed')
      sigs.push(...page)
      if (page.length < 1000) break
      before = page[page.length - 1].signature
    }
    for (const s of [...sigs].reverse()) {
      if (!s.err) await handle(s.signature) // a failed tx moved nothing
      S.lastSig = s.signature; save()
    }
    if (C.payouts) await refunds()
    if (C.payouts && ++addrTick % 3 === 0) await addrApi.tick().catch((e) => log('address orders:', e.message))
    if (C.payouts && (C.rebalanceLive || env.REBALANCE_DRY === '1') && Date.now() - lastRebalance > 10 * 60_000) {
      lastRebalance = Date.now()
      await rebalance({ conn, depositKp, wallet, S, C, store, save, log, live: C.rebalanceLive }).catch((e) => log('rebalance error', e.message))
    }
    // keep several spendable outputs in the float (never while a payout is in flight)
    if (C.payouts && env.FLOAT_SPLIT !== '0' && Date.now() - lastSplit > 5 * 60_000 && !Object.values(S.orders).some((o) => o.status === 'paying')) {
      lastSplit = Date.now()
      try {
        const plan = splitPlan(await wallet.outputs(), { maxPico: C.maxPico })
        if (plan) {
          const self = (await wallet.call('get_address', { account_index: 0 })).address
          const r = await wallet.split(self, plan.piecePico, plan.pieces)
          store.append('splits.jsonl', { pieces: plan.pieces, piecePico: String(plan.piecePico), xmrTx: r.txHash, fee: r.fee })
          log(`float split into ${plan.pieces} x ${plan.piecePico} pico: ${r.txHash}`)
        }
      } catch (e) { log('float split skipped:', e.message) }
    }
    // forget quotes nobody used
    const now = Date.now() / 1000
    let dirty = false
    for (const [id, q] of Object.entries(S.quotes)) if (!q.used && q.expiresAt + 3600 < now) { delete S.quotes[id]; dirty = dirty || q.checked }
    if (dirty) save()
  } catch (e) { log('tick:', e.message) } finally { busy = false }
}
setInterval(tick, 4000)

/* ---------------- http ---------------- */

const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)) }
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x')
  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim()
  try {
    if (u.pathname === '/v2/info') {
      const b = await freeXmr().catch(() => null)
      return json(res, 200, { version: VERSION, enabled: C.enabled && C.payouts, deposit: deposit.toBase58(), boxPub: Buffer.from(boxPub).toString('base64'), spreadBps: C.spreadBps, quoteTtl: C.ttl,
        minPico: String(C.minPico), maxPico: String(C.maxPico), availablePico: b ? String(b.free > C.maxPico ? C.maxPico : b.free < 0n ? 0n : b.free) : null,
        xchain: C.enabled && C.payouts && C.xchain, xfloat: C.enabled && C.payouts && C.xfloat, xFloatTtl: C.xFloatTtl, xMaxPico: String(C.xMaxPico < C.maxPico ? C.xMaxPico : C.maxPico), addrFeeBps: C.spreadBps + C.addrExtraBps, addrTtl: C.addrTtl })
    }
    if (u.pathname === '/v2/node') return json(res, 200, await nodeInfo().catch(() => { throw Object.assign(new Error('The Monero node is not answering'), { status: 503 }) }))
    if (u.pathname === '/v2/quote') return json(res, 200, await makeQuote({ inputMint: u.searchParams.get('in') || SOL, amount: u.searchParams.get('amount'), wallet: u.searchParams.get('wallet'), ip }))
    if (u.pathname === '/v2/stats') {
      const paid = [...Object.values(S.orders), ...Object.values(S.addr)].filter((o) => o.status === 'paid')
      if (Date.now() - reserveCache.at > 30_000) { try { reserveCache = { at: Date.now(), pico: String((await wallet.balance()).total) } } catch {} }
      return json(res, 200, {
        exits: paid.length, xmrPico: String(paid.reduce((s, o) => s + BigInt(o.xmrOut), 0n)),
        refunds: [...Object.values(S.orders), ...Object.values(S.addr)].filter((o) => o.status === 'refunded').length,
        reservePico: reserveCache.pico, enabled: C.enabled && C.payouts,
        lastPaidAt: paid.reduce((m, o) => Math.max(m, o.paidAt || 0), 0) || null,
      })
    }
    if (u.pathname === '/v2/estimate') return json(res, 200, await addrApi.estimate(u.searchParams.get('amount')))
    if (u.pathname === '/v2/address' && req.method === 'POST') {
      let body = ''; for await (const c of req) { body += c; if (body.length > 10_000) throw Object.assign(new Error('too large'), { status: 413 }) }
      const o = JSON.parse(body), r = await addrApi.create({ ...o, ip })
      return json(res, 200, { ...r, promise: promise({ order: r.address, send: r.lamports, to: r.address, xmrOut: r.xmrOut, sealed: o.sealed, expiresAt: r.expiresAt, refund: o.via === 'x' ? null : o.refund }) })
    }
    if (u.pathname === '/v2/check' && req.method === 'POST') {
      let body = ''; for await (const c of req) { body += c; if (body.length > 10_000) throw Object.assign(new Error('too large'), { status: 413 }) }
      return json(res, 200, await checkOrder(JSON.parse(body)))
    }
    // admin (server-local, secret): list orders needing a human; approve a refund for a held/stuck one; mark resolved
    if (u.pathname === '/v2/admin' && req.method === 'POST') {
      if (!env.SOLVER_ADMIN_SECRET || ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') return json(res, 404, { error: 'not found' })
      let body = ''; for await (const c of req) body += c
      const a = JSON.parse(body || '{}')
      if (!a.secret || a.secret.length !== env.SOLVER_ADMIN_SECRET.length || !timingSafeEqual(Buffer.from(a.secret), Buffer.from(env.SOLVER_ADMIN_SECRET))) return json(res, 403, { error: 'no' })
      if (a.action === 'list') return json(res, 200, [...Object.values(S.orders), ...Object.values(S.addr)].filter((o) => ['held', 'stuck', 'refund_pending', 'refunding', 'paying'].includes(o.status) || !!o.lateFunds || (o.via === 'x' && o.received && ['awaiting', 'expired'].includes(o.status))))
      if (a.addr) {
        // one-time address orders. retry: a held cross-chain order is tried again for a day, paid at the rate of that moment.
        // resolve: a human dealt with it outside the solver.
        const x = S.addr[a.addr]
        if (!x) return json(res, 404, { error: 'no such order' })
        if (a.action === 'retry' && x.via === 'x' && x.status === 'held') { x.status = 'expired'; x.nextTryAt = 0; x.giveUpAt = Math.floor(Date.now() / 1000) + 86_400; x.note = (x.note || '') + ' | retry approved by admin'; save(); log('ADMIN retry approved', x.addr); return json(res, 200, x) }
        if (a.action === 'resolve' && x.lateFunds) { x.lateFundsResolved = x.lateFunds; delete x.lateFunds; x.note = (x.note || '') + ' | late funds: ' + String(a.note || 'resolved by admin').slice(0, 200); save(); log('ADMIN resolved late funds', x.addr); return json(res, 200, x) }
        if (a.action === 'resolve' && ['held', 'stuck'].includes(x.status)) { x.status = 'resolved'; delete x.wantPico; x.note = (x.note || '') + ' | ' + String(a.note || 'resolved by admin').slice(0, 200); save(); log('ADMIN resolved', x.addr); return json(res, 200, x) }
        return json(res, 400, { error: `cannot ${a.action} an order that is ${x.status}` })
      }
      const o = S.orders[a.sig]
      if (!o) return json(res, 404, { error: 'no such order' })
      if (a.action === 'refund' && ['held', 'stuck'].includes(o.status)) { o.status = 'refund_pending'; o.tries = 0; o.blockTime = Math.floor(Date.now() / 1000); o.note = (o.note || '') + ' | refund approved by admin'; save(); log('ADMIN refund approved', o.sig); return json(res, 200, o) }
      if (a.action === 'resolve' && ['held', 'stuck'].includes(o.status)) { o.status = 'resolved'; o.note = (o.note || '') + ' | ' + String(a.note || 'resolved by admin').slice(0, 200); save(); log('ADMIN resolved', o.sig); return json(res, 200, o) }
      return json(res, 400, { error: `cannot ${a.action} an order that is ${o.status}` })
    }
    if (u.pathname === '/v2/order') {
      const o = S.orders[u.searchParams.get('sig') || ''] || S.addr[u.searchParams.get('addr') || '']
      if (!o) return json(res, 200, { status: 'waiting' })
      const s = u.searchParams.get('s') || ''
      const owner = o.secretHash && /^[0-9a-f]{64}$/.test(s) && timingSafeEqual(Buffer.from(secretHash(s)), Buffer.from(o.secretHash))
      return json(res, 200, { status: o.status, reason: o.reason, xmrOut: o.xmrOut, lamports: o.lamports, expiresAt: o.expiresAt, received: o.received, refundSig: o.refundSig, ...(o.repriced ? { repriced: o.repriced, quoted: o.quoted } : {}), ...(owner ? { xmrTx: o.xmrTx, txKey: o.txKey } : {}) })
    }
    json(res, 404, { error: 'not found' })
  } catch (e) { json(res, e.status || 500, { error: e.status ? e.message : 'Something went wrong. Try again.' }); if (!e.status) log('http error', e.stack) }
}).listen(C.port, '127.0.0.1', () => log(`solver ${VERSION} on :${C.port} · deposit ${deposit.toBase58()} · quotes ${C.enabled ? 'on' : 'off'} · payouts ${C.payouts ? 'on' : 'PAUSED'} · rebalance ${C.rebalanceLive ? 'LIVE' : 'off'}`))
tick()
