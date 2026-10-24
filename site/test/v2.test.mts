/*
  Tests for the browser side of the private exit (lib/v2.ts). No network, no keys:
    npx tsx --test test/v2.test.mts        (or: npm test)

  - the sealed address and memo are byte-for-byte what the solver (solver/core.js) expects
  - checkQuote refuses a quote that is not for what was typed
  - verifyV2 accepts the orders we build and refuses every tampered one
*/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import nacl from 'tweetnacl'
import {
  AddressLookupTableAccount, ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, TransactionInstruction,
  TransactionMessage, VersionedTransaction,
} from '@solana/web3.js'
import { SOLVER_BOX_PUB, SOLVER_DEPOSIT, WALLET_ROOM, checkQuote, newSecret, orderMemo, sealAddress, verifyV2 } from '../lib/v2'
import { ata } from '../lib/bridge'
import { ATA_PROGRAM, SOL_MINT, TOKEN_PROGRAM, USDC_MINT } from '../lib/constants'
// the solver's own pure logic: the other end of the memo
import * as core from '../../solver/core.js'

const MEMO = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')
const JUP = new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4')
const TOKEN_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')
// a real mainnet address (the solver wallet's own public address) and its subaddress
const XMR_ADDR = '42Fb6qKzN6dT475epTGdWUjWxesf24t2tDUn8r914XnNNGX8FzB5iJsTjGqK2FrADvSVotAuraZfF1hdimsfLhep13WySsg'
const XMR_SUB = '82eTuicddPLSeCTq31CDynHnHG6pZ2NE5N1KqrNBqdq9UdX6jdm2bjj9hxNHBWchUSMXt3ZQrLwtRCfcMViLfa9tFY2iF3W'
const QUOTE_ID = '0011223344556677'
const BLOCKHASH = '11111111111111111111111111111111'

const user = Keypair.generate().publicKey
const stranger = Keypair.generate().publicKey
const wsol = ata(user, SOL_MINT)
const LAMPORTS = 100_000_000n
const b64d = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

/* ---------------- sealing and memo ---------------- */

test('sealAddress: same bytes the solver would produce for the same one-time key', () => {
  const seed = new Uint8Array(32).fill(7)
  nacl.setPRNG((x, n) => { for (let i = 0; i < n; i++) x[i] = seed[i % 32] })
  let sealed: Uint8Array
  try { sealed = b64d(sealAddress(XMR_ADDR)) } finally {
    nacl.setPRNG((x, n) => { const r = crypto.getRandomValues(new Uint8Array(n)); for (let i = 0; i < n; i++) x[i] = r[i] })
  }
  const eph = nacl.box.keyPair.fromSecretKey(seed)
  const want = core.sealAddress(XMR_ADDR, SOLVER_BOX_PUB, eph)
  assert.equal(Buffer.from(sealed).toString('hex'), Buffer.from(want).toString('hex'))
  assert.equal(sealed.length, 32 + 16 + 69)
})

test('sealAddress: a fresh key every time, and the address never appears in the clear', () => {
  const a = sealAddress(XMR_ADDR), b = sealAddress(XMR_ADDR)
  assert.notEqual(a, b)
  assert.ok(!a.includes(XMR_ADDR.slice(0, 12)))
  assert.equal(b64d(sealAddress(XMR_SUB)).length, 32 + 16 + 69)
  assert.throws(() => sealAddress('not an address!'))
})

test('sealAddress: a solver holding the matching key opens it (round trip with a test key)', () => {
  // same construction, test keypair in place of the pinned one
  const solver = nacl.box.keyPair()
  const sealed = core.sealAddress(XMR_SUB, solver.publicKey)
  assert.equal(core.openAddress(sealed, solver.secretKey), XMR_SUB)
  assert.equal(core.openAddress(sealed, nacl.box.keyPair().secretKey), null)
})

test('newSecret: hash is what the solver computes from the secret', () => {
  const s = newSecret()
  assert.match(s.secret, /^[0-9a-f]{64}$/)
  assert.match(s.hash, /^[0-9a-f]{24}$/)
  assert.equal(s.hash, core.secretHash(s.secret))
  assert.notEqual(newSecret().secret, s.secret)
})

test('orderMemo: equals the solver format and parses back', () => {
  const s = newSecret()
  const sealed = sealAddress(XMR_ADDR)
  const memo = orderMemo(QUOTE_ID, s.hash, sealed)
  assert.equal(memo, core.formatMemo(QUOTE_ID, s.hash, Buffer.from(sealed, 'base64')))
  const p = core.parseMemo(memo)
  assert.ok(p)
  assert.equal(p.quoteId, QUOTE_ID)
  assert.equal(p.secretHash, s.hash)
  assert.equal(Buffer.from(p.sealed).toString('base64'), sealed)
  assert.ok(memo.length <= 190, `memo is ${memo.length} chars`)
})

/* ---------------- checkQuote ---------------- */

const SOL = SOL_MINT.toBase58()
const USDC = USDC_MINT.toBase58()
const swapQuote = (over: Record<string, unknown> = {}) => ({
  inputMint: USDC, outputMint: SOL, swapMode: 'ExactIn', inAmount: '25000000', outAmount: '101000000', otherAmountThreshold: '100000000', ...over,
})

test('checkQuote: SOL', () => {
  assert.equal(checkQuote({ lamports: '100000000', swapQuote: null }, { inputMint: SOL, amount: 100_000_000n }), null)
  assert.ok(checkQuote({ lamports: '100000001', swapQuote: null }, { inputMint: SOL, amount: 100_000_000n }))
  assert.ok(checkQuote({ lamports: '99999999', swapQuote: null }, { inputMint: SOL, amount: 100_000_000n }))
})

test('checkQuote: token', () => {
  const p = { inputMint: USDC, amount: 25_000_000n }
  assert.equal(checkQuote({ lamports: '100000000', swapQuote: swapQuote() }, p), null)
  assert.equal(checkQuote({ lamports: '100000000', swapQuote: swapQuote({ platformFee: { amount: '0', feeBps: 0 } }) }, p), null)
  assert.ok(checkQuote({ lamports: '100000000', swapQuote: null }, p), 'missing swap quote')
  assert.ok(checkQuote({ lamports: '100000000', swapQuote: swapQuote({ inputMint: stranger.toBase58() }) }, p), 'other token in')
  assert.ok(checkQuote({ lamports: '100000000', swapQuote: swapQuote({ outputMint: USDC }) }, p), 'not into SOL')
  assert.ok(checkQuote({ lamports: '100000000', swapQuote: swapQuote({ swapMode: 'ExactOut' }) }, p), 'ExactOut')
  assert.ok(checkQuote({ lamports: '100000000', swapQuote: swapQuote({ inAmount: '26000000' }) }, p), 'takes more than typed')
  assert.ok(checkQuote({ lamports: '100000001', swapQuote: swapQuote() }, p), 'order sends more than the swap guarantees')
  assert.ok(checkQuote({ lamports: '100000000', swapQuote: swapQuote({ otherAmountThreshold: '99000000' }) }, p), 'threshold below the order')
  assert.ok(checkQuote({ lamports: '100000000', swapQuote: swapQuote({ platformFee: { amount: '5', feeBps: 1 } }) }, p), 'platform fee')
})

/* ---------------- verifyV2 ---------------- */

const memoText = orderMemo(QUOTE_ID, newSecret().hash, sealAddress(XMR_ADDR))
const memoIx = (text = memoText) => new TransactionInstruction({ programId: MEMO, keys: [], data: Buffer.from(text) })
const pay = (to = SOLVER_DEPOSIT, lamports = LAMPORTS, from = user) => SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports })
const budget = (units = 200_000, microLamports = 50_000) => [ComputeBudgetProgram.setComputeUnitLimit({ units }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports })]
const w = (pubkey: PublicKey, isSigner = false) => ({ pubkey, isSigner, isWritable: true })
const ro = (pubkey: PublicKey) => ({ pubkey, isSigner: false, isWritable: false })

// the instructions a token route adds around the solver payment
const createWsol = (owner = user, payer = user) => new TransactionInstruction({
  programId: ATA_PROGRAM, data: Buffer.from([1]),
  keys: [w(payer, true), w(ata(owner, SOL_MINT)), ro(owner), ro(SOL_MINT), ro(SystemProgram.programId), ro(TOKEN_PROGRAM)],
})
const jupSwap = (dest = wsol) => new TransactionInstruction({
  programId: JUP, data: Buffer.from([0xe5, 0x17, 0xcb, 0x97, 0x7a, 0xe3, 0xad, 0x2a, 1, 2, 3, 4]),
  keys: [ro(TOKEN_PROGRAM), w(user, true), w(ata(user, USDC_MINT)), w(dest), ro(USDC_MINT), ro(SOL_MINT)],
})
const closeWsol = (dest = user, owner = user) => new TransactionInstruction({
  programId: TOKEN_PROGRAM, data: Buffer.from([9]), keys: [w(wsol), w(dest), ro(owner)],
})
const syncNative = () => new TransactionInstruction({ programId: TOKEN_PROGRAM, data: Buffer.from([17]), keys: [w(wsol)] })
const tokenTransfer = (program = TOKEN_PROGRAM) => new TransactionInstruction({
  programId: program, data: Buffer.from([3, 1, 0, 0, 0, 0, 0, 0, 0]), keys: [w(ata(user, USDC_MINT)), w(ata(stranger, USDC_MINT)), ro(user)],
})

function build(ixs: TransactionInstruction[], opts: { payer?: PublicKey; alts?: AddressLookupTableAccount[] } = {}) {
  const alts = opts.alts || []
  const msg = new TransactionMessage({ payerKey: opts.payer || user, recentBlockhash: BLOCKHASH, instructions: ixs }).compileToV0Message(alts)
  return { tx: new VersionedTransaction(msg), alts }
}
const verify = (ixs: TransactionInstruction[], opts: { payer?: PublicKey; alts?: AddressLookupTableAccount[]; lamports?: bigint; memo?: string } = {}) => {
  const { tx, alts } = build(ixs, opts)
  // what the wallet is shown is the serialized transaction: check that, not the object we built
  const wire = VersionedTransaction.deserialize(tx.serialize())
  return verifyV2(wire, alts, { user, lamports: opts.lamports ?? LAMPORTS, memo: opts.memo ?? memoText })
}
const ok = (ixs: TransactionInstruction[], opts = {}) => assert.equal(verify(ixs, opts), null)
const bad = (ixs: TransactionInstruction[], reason: RegExp, opts = {}) => {
  const r = verify(ixs, opts)
  assert.ok(r, 'expected the order to be refused')
  assert.match(r, reason)
}

test('verifyV2: a plain SOL order passes, and leaves room for the wallet guard', () => {
  const ixs = [...budget(), pay(), memoIx()]
  ok(ixs)
  ok([pay(), memoIx()]) // no priority fee at all
  const bytes = build(ixs).tx.serialize().length
  assert.ok(bytes <= 1232 - WALLET_ROOM, `SOL order is ${bytes} bytes`)
})

test('verifyV2: a token order (create wSOL, swap, close, pay, memo) passes', () => {
  ok([...budget(700_000), createWsol(), jupSwap(), closeWsol(), pay(), memoIx()])
  // wrapping SOL into your own wSOL account is allowed next to the payment
  ok([...budget(700_000), createWsol(), pay(wsol, 5_000_000n), syncNative(), jupSwap(), closeWsol(), pay(), memoIx()])
})

test('verifyV2: accounts loaded from a lookup table are resolved, not trusted', () => {
  const table = (addresses: PublicKey[]) => new AddressLookupTableAccount({
    key: Keypair.generate().publicKey,
    state: { deactivationSlot: 2n ** 64n - 1n, lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, authority: undefined, addresses },
  })
  const good = table([wsol, ata(user, USDC_MINT), USDC_MINT, SOL_MINT])
  const g = build([...budget(700_000), jupSwap(), pay(), memoIx()], { alts: [good] })
  assert.ok(g.tx.message.addressTableLookups.length > 0, 'the test must actually use the table')
  assert.equal(verifyV2(g.tx, g.alts, { user, lamports: LAMPORTS, memo: memoText }), null)
  // the solver hidden behind a table is still recognised; a stranger behind a table is still refused
  const evil = table([stranger, wsol])
  const e = build([...budget(), pay(), pay(stranger, 1n), memoIx()], { alts: [evil] })
  assert.ok(e.tx.message.addressTableLookups.length > 0)
  assert.match(verifyV2(e.tx, e.alts, { user, lamports: LAMPORTS, memo: memoText }) || '', /somewhere unexpected/)
})

test('verifyV2: payment tampering is refused', () => {
  bad([...budget(), pay(SOLVER_DEPOSIT, LAMPORTS + 1n), memoIx()], /not what you were quoted/)
  bad([...budget(), pay(SOLVER_DEPOSIT, LAMPORTS - 1n), memoIx()], /not what you were quoted/)
  bad([...budget(), pay(stranger), memoIx()], /somewhere unexpected/)
  bad([...budget(), pay(), pay(stranger, 1n), memoIx()], /somewhere unexpected/)
  bad([...budget(), pay(), pay(), memoIx()], /exactly once/)
  bad([...budget(), memoIx()], /exactly once/)
  bad([...budget(), pay(wsol), memoIx()], /exactly once/) // wrap only, solver never paid
  bad([...budget(), pay(), memoIx()], /not what you were quoted/, { lamports: LAMPORTS * 2n })
})

test('verifyV2: someone else paying or sending is refused', () => {
  bad([...budget(), pay(), memoIx()], /fee payer/, { payer: stranger })
  bad([...budget(), pay(SOLVER_DEPOSIT, LAMPORTS, stranger), memoIx()], /not from your wallet/)
})

test('verifyV2: memo tampering is refused', () => {
  const other = orderMemo(QUOTE_ID, newSecret().hash, sealAddress(XMR_SUB))
  bad([...budget(), pay(), memoIx(other)], /memo was changed/)
  bad([...budget(), pay()], /exactly one order memo/)
  bad([...budget(), pay(), memoIx(), memoIx()], /exactly one order memo/)
  bad([...budget(), pay(), memoIx(memoText + ' ')], /memo was changed/)
})

test('verifyV2: other system instructions are refused', () => {
  const assign = SystemProgram.assign({ accountPubkey: user, programId: stranger })
  const create = SystemProgram.createAccount({ fromPubkey: user, newAccountPubkey: stranger, lamports: 1_000_000, space: 0, programId: stranger })
  bad([...budget(), pay(), assign, memoIx()], /unexpected system instruction/)
  bad([...budget(), pay(), create, memoIx()], /unexpected system instruction/)
})

test('verifyV2: token instructions that could move funds are refused', () => {
  bad([...budget(), tokenTransfer(), pay(), memoIx()], /unexpected token instruction/)
  bad([...budget(), tokenTransfer(TOKEN_2022), pay(), memoIx()], /unexpected token instruction/)
  // closing your wSOL account to someone else sends them the SOL from the swap
  bad([...budget(700_000), jupSwap(), closeWsol(stranger), pay(), memoIx()], /unexpected token instruction/)
  bad([...budget(700_000), jupSwap(), closeWsol(user, stranger), pay(), memoIx()], /unexpected token instruction/)
  // approve (4) and setAuthority (6)
  for (const tag of [4, 6, 12]) {
    const ix = new TransactionInstruction({ programId: TOKEN_PROGRAM, data: Buffer.from([tag, 1, 0, 0, 0, 0, 0, 0, 0, 0]), keys: [w(wsol), ro(stranger), ro(user)] })
    bad([...budget(), ix, pay(), memoIx()], /unexpected token instruction/)
  }
})

test('verifyV2: account creation only for you, paid by you', () => {
  bad([...budget(), createWsol(stranger), pay(), memoIx()], /unexpected account creation/)
  bad([...budget(), createWsol(user, stranger), pay(), memoIx()], /unexpected account creation|fee payer/)
})

test('verifyV2: a swap must pay into your own SOL account', () => {
  bad([...budget(700_000), jupSwap(ata(stranger, SOL_MINT)), pay(), memoIx()], /does not pay into your own SOL account/)
})

test('verifyV2: unknown programs and compute budget tricks are refused', () => {
  const unknown = new TransactionInstruction({ programId: stranger, data: Buffer.from([1]), keys: [w(user, true)] })
  bad([...budget(), pay(), memoIx(), unknown], /unexpected program/)
  const heap = ComputeBudgetProgram.requestHeapFrame({ bytes: 64 * 1024 })
  bad([heap, pay(), memoIx()], /unexpected compute budget instruction/)
})

test('verifyV2: priority fee is capped at 0.01 SOL', () => {
  ok([...budget(1_000_000, 10_000_000), pay(), memoIx()]) // exactly 0.01 SOL
  bad([...budget(1_000_000, 10_000_001), pay(), memoIx()], /priority fee is too high/)
  bad([...budget(1_400_000, 1_000_000_000), pay(), memoIx()], /priority fee is too high/)
  // no limit set: the default ceiling of 1.4M units is assumed
  bad([ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 8_000_000 }), pay(), memoIx()], /priority fee is too high/)
})
