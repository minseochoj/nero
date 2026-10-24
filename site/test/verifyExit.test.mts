/*
  Tests for the browser side of the standard exit (lib/verifyExit.ts). No network, no keys:
    npx tsx --test test/verifyExit.test.mts        (or: npm test)

  - the transactions the server builds (lib/server/exit.ts: budget, setup, swap, cleanup, bridge) pass
  - every tampered copy is refused before the wallet sees it: another Monero address, less XMR,
    a second destination, someone else's accounts, extra instructions, an oversized priority fee
  - "what is not checked today" at the bottom pins the known limits, so a change there is a decision
*/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AddressLookupTableAccount, ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, TransactionInstruction,
  TransactionMessage, VersionedTransaction,
} from '@solana/web3.js'
import { verifyExit } from '../lib/verifyExit'
import { ata, cancelWithdrawalIx, createAtaIdempotentIx, requestWithdrawalIx } from '../lib/bridge'
import { MIN_WITHDRAW_PICO, SOL_MINT, TOKEN_PROGRAM, USDC_MINT, WXMR_MINT } from '../lib/constants'

const MEMO = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')
const JUP = new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4')
const TOKEN_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')
// real mainnet addresses (the solver wallet's public address and its subaddress): same length, different text
const XMR_ADDR = '42Fb6qKzN6dT475epTGdWUjWxesf24t2tDUn8r914XnNNGX8FzB5iJsTjGqK2FrADvSVotAuraZfF1hdimsfLhep13WySsg'
const XMR_OTHER = '82eTuicddPLSeCTq31CDynHnHG6pZ2NE5N1KqrNBqdq9UdX6jdm2bjj9hxNHBWchUSMXt3ZQrLwtRCfcMViLfa9tFY2iF3W'
const BLOCKHASH = '11111111111111111111111111111111'

const user = Keypair.generate().publicKey
const stranger = Keypair.generate().publicKey
const wsol = ata(user, SOL_MINT)
const wxmr = ata(user, WXMR_MINT)
const NONCE = 1_791_600_000_000n
const AMOUNT = 250_000_000_000n // 0.25 XMR
const MIN = (AMOUNT * 97n) / 100n // what Exit.tsx passes: 97% of the amount shown

const w = (pubkey: PublicKey, isSigner = false) => ({ pubkey, isSigner, isWritable: true })
const ro = (pubkey: PublicKey) => ({ pubkey, isSigner: false, isWritable: false })

const budget = (units = 600_000, microLamports = 50_000) => [ComputeBudgetProgram.setComputeUnitLimit({ units }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports })]
const createWxmr = (owner = user, payer = user) => createAtaIdempotentIx(payer, owner, WXMR_MINT)
const createWsol = () => createAtaIdempotentIx(user, user, SOL_MINT)
const wrap = (to = wsol, lamports = 1_000_000_000n, from = user) => SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports })
const syncNative = (program = TOKEN_PROGRAM) => new TransactionInstruction({ programId: program, data: Buffer.from([17]), keys: [w(wsol)] })
const closeWsol = (dest = user, owner = user) => new TransactionInstruction({
  programId: TOKEN_PROGRAM, data: Buffer.from([9]), keys: [w(wsol), w(dest), ro(owner)],
})
// a swap as the router lays it out: the user signs, source and destination token accounts follow
const swap = (source = wsol, dest = wxmr) => new TransactionInstruction({
  programId: JUP, data: Buffer.from([0xe5, 0x17, 0xcb, 0x97, 0x7a, 0xe3, 0xad, 0x2a, 1, 2, 3, 4]),
  keys: [ro(TOKEN_PROGRAM), w(user, true), w(source), w(dest), ro(SOL_MINT), ro(WXMR_MINT)],
})
const bridge = (amount = AMOUNT, addr = XMR_ADDR, exactOut = false, who = user) => requestWithdrawalIx(who, NONCE, amount, addr, exactOut)
/** A copy of an instruction with its data or accounts changed after the fact. */
const edit = (ix: TransactionInstruction, f: (data: Buffer, keys: TransactionInstruction['keys']) => Buffer | void) => {
  const data = Buffer.from(ix.data)
  const keys = ix.keys.map((k) => ({ ...k }))
  return new TransactionInstruction({ programId: ix.programId, keys, data: f(data, keys) || data })
}

// what lib/server/exit.ts builds: budget, setup, swap, cleanup, bridge request last
const solExit = (last = bridge()) => [...budget(), createWxmr(), createWsol(), wrap(), syncNative(), swap(), closeWsol(), last]
const usdcExit = (last = bridge()) => [...budget(), createWxmr(), swap(ata(user, USDC_MINT)), last]

function build(ixs: TransactionInstruction[], opts: { payer?: PublicKey; alts?: AddressLookupTableAccount[] } = {}) {
  const alts = opts.alts || []
  const msg = new TransactionMessage({ payerKey: opts.payer || user, recentBlockhash: BLOCKHASH, instructions: ixs }).compileToV0Message(alts)
  return { tx: new VersionedTransaction(msg), alts }
}
type Opts = { payer?: PublicKey; alts?: AddressLookupTableAccount[]; user?: PublicKey; xmrAddress?: string; minAmount?: bigint }
const verify = (ixs: TransactionInstruction[], opts: Opts = {}) => {
  const { tx, alts } = build(ixs, opts)
  // what the wallet is shown is the serialized transaction: check that, not the object we built
  const wire = VersionedTransaction.deserialize(tx.serialize())
  return verifyExit(wire, alts, { user: opts.user ?? user, xmrAddress: opts.xmrAddress ?? XMR_ADDR, minAmount: opts.minAmount ?? MIN })
}
const ok = (ixs: TransactionInstruction[], opts: Opts = {}) => assert.equal(verify(ixs, opts), null)
const bad = (ixs: TransactionInstruction[], reason: RegExp, opts: Opts = {}) => {
  const r = verify(ixs, opts)
  assert.ok(r, 'expected the exit to be refused')
  assert.match(r, reason)
}

/* ---------------- genuine exits ---------------- */

test('verifyExit: a SOL exit and a token exit as the server builds them pass', () => {
  ok(solExit())
  ok(usdcExit())
  ok([swap(), bridge()]) // no priority fee, accounts already exist
  ok([...budget(), createWxmr(), swap(), new TransactionInstruction({ programId: TOKEN_2022, data: Buffer.from([17]), keys: [w(wsol)] }), bridge()])
})

test('verifyExit: the bridge may send more than quoted, never less', () => {
  ok(usdcExit(bridge(AMOUNT + 1n)))
  ok(usdcExit(), { minAmount: AMOUNT }) // exactly the quote
  bad(usdcExit(), /less XMR than quoted/, { minAmount: AMOUNT + 1n })
  bad(usdcExit(bridge(MIN - 1n)), /less XMR than quoted/)
  bad(usdcExit(bridge(1n)), /less XMR than quoted/)
  // the bridge's own 0.1 XMR floor holds even if the page asked for less
  ok(usdcExit(bridge(MIN_WITHDRAW_PICO)), { minAmount: 1n })
  bad(usdcExit(bridge(MIN_WITHDRAW_PICO - 1n)), /less XMR than quoted/, { minAmount: 1n })
})

test('verifyExit: accounts loaded from a lookup table are resolved, not trusted', () => {
  const table = (addresses: PublicKey[]) => new AddressLookupTableAccount({
    key: Keypair.generate().publicKey,
    state: { deactivationSlot: 2n ** 64n - 1n, lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, authority: undefined, addresses },
  })
  const good = table([wxmr, ata(user, USDC_MINT), WXMR_MINT, SOL_MINT])
  const g = build(usdcExit(), { alts: [good] })
  assert.ok(g.tx.message.addressTableLookups.length > 0, 'the test must actually use the table')
  assert.equal(verifyExit(g.tx, g.alts, { user, xmrAddress: XMR_ADDR, minAmount: MIN }), null)
  // a stranger's wXMR account behind a table is still seen for what it is
  const theirs = ata(stranger, WXMR_MINT)
  const evil = table([theirs, WXMR_MINT])
  const e = build([...budget(), swap(ata(user, USDC_MINT), theirs), edit(bridge(), (_d, k) => { k[3].pubkey = theirs })], { alts: [evil] })
  assert.ok(e.tx.message.addressTableLookups.length > 0)
  assert.match(verifyExit(e.tx, e.alts, { user, xmrAddress: XMR_ADDR, minAmount: MIN }) || '', /does not burn from your wXMR account/)
})

/* ---------------- the bridge request ---------------- */

test('verifyExit: another Monero address is refused', () => {
  bad(usdcExit(bridge(AMOUNT, XMR_OTHER)), /Monero address in the transaction does not match/)
  // one changed character, same length
  bad(usdcExit(edit(bridge(), (d) => { d[40] = d[40] === 65 ? 66 : 65 })), /Monero address in the transaction does not match/)
  bad(usdcExit(bridge(AMOUNT, XMR_ADDR + ' ')), /Monero address in the transaction does not match/)
  bad(usdcExit(bridge(AMOUNT, XMR_ADDR.slice(0, -1))), /Monero address in the transaction does not match/)
  bad(usdcExit(), /Monero address in the transaction does not match/, { xmrAddress: XMR_OTHER })
})

test('verifyExit: the request must be one well-formed withdrawal, placed last', () => {
  bad([...budget(), createWxmr(), swap()], /missing or not last/)
  bad([...budget(), bridge(), swap()], /missing or not last/)
  bad([...usdcExit(), syncNative()], /missing or not last/)
  bad([...budget(), swap(), bridge(), bridge()], /more than one bridge instruction/)
  bad([...budget(), swap(), bridge(AMOUNT, XMR_OTHER), bridge()], /more than one bridge instruction/)
  // another bridge instruction in its place
  bad([...budget(), swap(), cancelWithdrawalIx(user, NONCE)], /not a bridge withdrawal/)
  bad(usdcExit(edit(bridge(), (d) => { d[0] ^= 1 })), /not a bridge withdrawal/)
  // bytes added, removed, or a length that lies
  bad(usdcExit(edit(bridge(), (d) => Buffer.concat([d, Buffer.from([0])]))), /malformed bridge request/)
  bad(usdcExit(edit(bridge(), (d) => d.subarray(0, d.length - 1))), /malformed bridge request/)
  bad(usdcExit(edit(bridge(), (d) => { d.writeUInt32LE(d.readUInt32LE(24) - 1, 24) })), /malformed bridge request/)
  bad(usdcExit(edit(bridge(), (d) => d.subarray(0, 20))), /not a bridge withdrawal/)
})

test('verifyExit: exact-out is refused (the bridge fee must come out of the amount, not on top)', () => {
  bad(usdcExit(bridge(AMOUNT, XMR_ADDR, true)), /unexpected exact-out flag/)
  bad(usdcExit(edit(bridge(), (d) => { d[d.length - 1] = 2 })), /unexpected exact-out flag/)
})

test('verifyExit: the burn must come from your own wXMR account, signed by you', () => {
  bad(usdcExit(edit(bridge(), (_d, k) => { k[3].pubkey = ata(stranger, WXMR_MINT) })), /does not burn from your wXMR account/)
  bad(usdcExit(edit(bridge(), (_d, k) => { k[3].pubkey = wsol })), /does not burn from your wXMR account/)
  bad(usdcExit(edit(bridge(), (_d, k) => { k[6] = ro(stranger) })), /not signed by your wallet/)
  // a request built for someone else entirely
  bad(usdcExit(bridge(AMOUNT, XMR_ADDR, false, stranger)), /does not burn from your wXMR account/)
})

/* ---------------- everything around it ---------------- */

test('verifyExit: someone else as fee payer, or checking for another wallet, is refused', () => {
  bad(usdcExit(), /fee payer is not your wallet/, { payer: stranger })
  bad(usdcExit(), /fee payer is not your wallet/, { user: stranger })
})

test('verifyExit: SOL may only be wrapped into your own wSOL account', () => {
  bad([...budget(), wrap(stranger), swap(), bridge()], /unexpected SOL transfer/)
  bad([...budget(), wrap(ata(stranger, SOL_MINT)), swap(), bridge()], /unexpected SOL transfer/)
  bad([...budget(), wrap(wxmr), swap(), bridge()], /unexpected SOL transfer/)
  bad([...budget(), wrap(wsol, 1n, stranger), swap(), bridge()], /unexpected SOL transfer/)
  const assign = SystemProgram.assign({ accountPubkey: user, programId: stranger })
  const create = SystemProgram.createAccount({ fromPubkey: user, newAccountPubkey: stranger, lamports: 1_000_000, space: 0, programId: stranger })
  bad([...budget(), assign, swap(), bridge()], /unexpected SOL transfer/)
  bad([...budget(), create, swap(), bridge()], /unexpected SOL transfer/)
})

test('verifyExit: token instructions that could move funds are refused', () => {
  const transfer = (program = TOKEN_PROGRAM) => new TransactionInstruction({
    programId: program, data: Buffer.from([3, 1, 0, 0, 0, 0, 0, 0, 0]), keys: [w(wxmr), w(ata(stranger, WXMR_MINT)), ro(user)],
  })
  bad([...budget(), swap(), transfer(), bridge()], /unexpected token instruction/)
  bad([...budget(), swap(), transfer(TOKEN_2022), bridge()], /unexpected token instruction/)
  // closing your wSOL account to someone else sends them the SOL left in it
  bad([...budget(), swap(), closeWsol(stranger), bridge()], /unexpected token instruction/)
  bad([...budget(), swap(), closeWsol(user, stranger), bridge()], /unexpected token instruction/)
  // approve (4), setAuthority (6), transferChecked (12), burn (8)
  for (const tag of [4, 6, 12, 8]) {
    const ix = new TransactionInstruction({ programId: TOKEN_PROGRAM, data: Buffer.from([tag, 1, 0, 0, 0, 0, 0, 0, 0, 0]), keys: [w(wxmr), ro(stranger), ro(user)] })
    bad([...budget(), swap(), ix, bridge()], /unexpected token instruction/)
  }
})

test('verifyExit: account creation only for you, paid by you', () => {
  bad([...budget(), createWxmr(stranger), swap(), bridge()], /unexpected account creation/)
  bad([...budget(), createWxmr(user, stranger), swap(), bridge()], /unexpected account creation|fee payer/)
  // recover-nested (2) is not a creation
  bad([...budget(), edit(createWxmr(), (d) => { d[0] = 2 }), swap(), bridge()], /unexpected account creation/)
})

test('verifyExit: the swap must pay into your own wXMR account', () => {
  bad([...budget(), swap(wsol, ata(stranger, WXMR_MINT)), bridge()], /does not pay into your wXMR account/)
  bad([...budget(), swap(wsol, wsol), bridge()], /does not pay into your wXMR account/)
  bad([...budget(), createWxmr(), bridge()], /does not pay into your wXMR account/) // no swap at all
})

test('verifyExit: unknown programs and compute budget tricks are refused', () => {
  const unknown = new TransactionInstruction({ programId: stranger, data: Buffer.from([1]), keys: [w(user, true)] })
  const memo = new TransactionInstruction({ programId: MEMO, keys: [], data: Buffer.from('hello') })
  bad([...budget(), unknown, swap(), bridge()], /unexpected program/)
  bad([...budget(), memo, swap(), bridge()], /unexpected program/)
  bad([ComputeBudgetProgram.requestHeapFrame({ bytes: 64 * 1024 }), swap(), bridge()], /unexpected compute budget instruction/)
  // setLoadedAccountsDataSizeLimit (4)
  const loaded = new TransactionInstruction({ programId: ComputeBudgetProgram.programId, keys: [], data: Buffer.from([4, 0, 0, 1, 0]) })
  bad([loaded, swap(), bridge()], /unexpected compute budget instruction/)
})

test('verifyExit: priority fee is capped at 0.01 SOL', () => {
  ok([...budget(1_000_000, 10_000_000), swap(), bridge()]) // exactly 0.01 SOL
  bad([...budget(1_000_000, 10_000_001), swap(), bridge()], /priority fee too high/)
  bad([...budget(1_400_000, 1_000_000_000), swap(), bridge()], /priority fee too high/)
  // the last limit and price in the transaction are the ones counted
  bad([...budget(1, 1), ...budget(1_400_000, 1_000_000_000), swap(), bridge()], /priority fee too high/)
})

/* ---------------- what is not checked today ----------------
   These pass. They are written down so that nobody assumes otherwise, and so that tightening
   any of them shows up as a failing test and a decision (see ops/BACKLOG.md, "Needs the owner"). */

test('verifyExit, known limit: a price with no limit is costed at 200,000 units', () => {
  // the server always sets a limit (lib/server/exit.ts), so this path is not used by our own builds
  ok([ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000_000 }), swap(), bridge()])
  bad([ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000_005 }), swap(), bridge()], /priority fee too high/)
})

test('verifyExit, known limit: router instructions are not decoded', () => {
  // one swap into your wXMR account is enough; a second router instruction is accepted unread
  const second = swap(ata(user, USDC_MINT), ata(stranger, USDC_MINT))
  ok([...budget(), swap(), second, bridge()])
  // the amount wrapped into your own wSOL account is not compared with what you typed
  ok([...budget(), createWsol(), wrap(wsol, 500_000_000_000n), syncNative(), swap(), closeWsol(), bridge()])
})
