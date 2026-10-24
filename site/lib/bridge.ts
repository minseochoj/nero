import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js'
import { ATA_PROGRAM, BRIDGE_AUTHORITY, BRIDGE_PROGRAM, TOKEN_PROGRAM, WXMR_MINT } from './constants'

/*
  Hand-rolled client for the wxmr.io bridge (program EzBkC8P5…), from its
  on-chain Anchor IDL. No Anchor dependency: discriminators and Borsh layouts
  are written out here so the browser bundle stays small and every byte we
  sign is visible.
*/

const enc = new TextEncoder()
const dec = new TextDecoder()
const seed = (s: string) => enc.encode(s)
const P = BRIDGE_PROGRAM

const IX = {
  request_withdrawal: [251, 85, 121, 205, 56, 201, 12, 177],
  create_deposit_account: [25, 217, 82, 207, 22, 150, 122, 181],
  claim_pending_mint: [231, 97, 226, 31, 241, 172, 157, 190],
  cancel_withdrawal: [183, 104, 181, 250, 28, 128, 210, 70],
}
const ACCT = {
  BridgeConfig: [40, 206, 51, 233, 246, 40, 178, 85],
  DepositRecord: [83, 232, 10, 31, 251, 49, 189, 167],
  UserWithdrawalState: [206, 93, 63, 106, 34, 146, 231, 230],
  WithdrawalRecord: [88, 59, 154, 202, 216, 210, 211, 237],
}
export const EVENT = {
  WithdrawRequested: [21, 86, 249, 76, 80, 238, 207, 154],
  WithdrawCompleted: [192, 162, 40, 197, 83, 94, 198, 66],
  WithdrawReverted: [41, 94, 186, 33, 56, 24, 133, 80],
  DepositMinted: [187, 199, 161, 126, 73, 247, 28, 44],
}

/* ---------------- PDAs ---------------- */

const pda = (seeds: Uint8Array[]) => PublicKey.findProgramAddressSync(seeds, P)[0]
const u64le = (n: bigint) => {
  const b = new Uint8Array(8)
  new DataView(b.buffer).setBigUint64(0, n, true)
  return b
}
export const configPda = () => pda([seed('config')])
export const feeTreasuryPda = () => pda([seed('fee_treasury')])
export const feeOverridePda = (user: PublicKey) => pda([seed('fee_override'), user.toBytes()])
export const withdrawalStatePda = (user: PublicKey) => pda([seed('withdrawal_state'), user.toBytes()])
export const withdrawalPda = (user: PublicKey, nonce: bigint) => pda([seed('withdrawal'), user.toBytes(), u64le(nonce)])
export const depositPda = (owner: PublicKey) => pda([seed('deposit'), owner.toBytes()])
export const ata = (owner: PublicKey, mint: PublicKey = WXMR_MINT) =>
  PublicKey.findProgramAddressSync([owner.toBytes(), TOKEN_PROGRAM.toBytes(), mint.toBytes()], ATA_PROGRAM)[0]

/* ---------------- Borsh reader ---------------- */

class Reader {
  o = 8 // past the discriminator
  constructor(private b: Uint8Array) {}
  private dv = () => new DataView(this.b.buffer, this.b.byteOffset, this.b.byteLength)
  key() { const k = new PublicKey(this.b.subarray(this.o, this.o + 32)); this.o += 32; return k }
  u8() { return this.b[this.o++] }
  u16() { const v = this.dv().getUint16(this.o, true); this.o += 2; return v }
  u32() { const v = this.dv().getUint32(this.o, true); this.o += 4; return v }
  u64() { const v = this.dv().getBigUint64(this.o, true); this.o += 8; return v }
  i64() { const v = this.dv().getBigInt64(this.o, true); this.o += 8; return v }
  bool() { return this.u8() !== 0 }
  str() { const n = this.u32(); const s = dec.decode(this.b.subarray(this.o, this.o + n)); this.o += n; return s }
}
const isA = (data: Uint8Array, d: number[]) => data.length >= 8 && d.every((x, i) => data[i] === x)

/* ---------------- accounts ---------------- */

export type BridgeConfig = { authority: string; mint: string; totalDeposits: bigint; totalWithdrawals: bigint; feeBps: number }
export function decodeConfig(data: Uint8Array): BridgeConfig {
  if (!isA(data, ACCT.BridgeConfig)) throw new Error('not a bridge config')
  const r = new Reader(data)
  const authority = r.key().toBase58()
  const mint = r.key().toBase58()
  const totalDeposits = r.u64()
  const totalWithdrawals = r.u64()
  r.u8()
  return { authority, mint, totalDeposits, totalWithdrawals, feeBps: r.u16() }
}

export type WithdrawalStatus = 'pending' | 'sending' | 'completed'
export type Withdrawal = {
  user: string; nonce: bigint; amount: bigint; xmrAddress: string; exactOut: boolean
  status: WithdrawalStatus; createdAt: number; fee: bigint
}
export function decodeWithdrawal(data: Uint8Array): Withdrawal {
  if (!isA(data, ACCT.WithdrawalRecord)) throw new Error('not a withdrawal record')
  const r = new Reader(data)
  const user = r.key().toBase58()
  const nonce = r.u64()
  const amount = r.u64()
  const xmrAddress = r.str()
  const exactOut = r.bool()
  const status = (['pending', 'sending', 'completed'] as const)[r.u8()] ?? 'pending'
  r.u8()
  const createdAt = Number(r.i64())
  const fee = r.o + 8 <= data.length ? r.u64() : 0n
  return { user, nonce, amount, xmrAddress, exactOut, status, createdAt, fee }
}

export type DepositStatus = 'pending' | 'active' | 'closed'
export type Deposit = { owner: string; xmrAddress: string; totalDeposited: bigint; status: DepositStatus; createdAt: number }
export function decodeDeposit(data: Uint8Array): Deposit {
  if (!isA(data, ACCT.DepositRecord)) throw new Error('not a deposit record')
  const r = new Reader(data)
  const owner = r.key().toBase58()
  const xmrAddress = r.str()
  const totalDeposited = r.u64()
  const status = (['pending', 'active', 'closed'] as const)[r.u8()] ?? 'pending'
  r.u8()
  return { owner, xmrAddress, totalDeposited, status, createdAt: Number(r.i64()) }
}

export function decodeLastNonce(data: Uint8Array): bigint {
  if (!isA(data, ACCT.UserWithdrawalState)) throw new Error('not a withdrawal state')
  const r = new Reader(data)
  r.key()
  return r.u64()
}

/** The next nonce the bridge will accept: above the stored watermark, and a timestamp so it is unique. */
export function nextNonce(lastNonce: bigint | null, now = Date.now()): bigint {
  const min = lastNonce === null ? 1n : lastNonce + 1n
  const t = BigInt(now)
  return min > t ? min : t
}

/* ---------------- events (from "Program data:" log lines) ---------------- */

export type BridgeEvent =
  | { kind: 'completed'; withdrawal: string; user: string; amount: bigint; xmrAddress: string; xmrTxHash: string; xmrTxKey: string }
  | { kind: 'reverted'; withdrawal: string; user: string; amount: bigint; fee: bigint; reason: string }
  | { kind: 'requested'; withdrawal: string; user: string; nonce: bigint; amount: bigint; fee: bigint; xmrAddress: string }

export function decodeEvent(b64: string): BridgeEvent | null {
  let data: Uint8Array
  try { data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) } catch { return null }
  const r = new Reader(data)
  try {
    if (isA(data, EVENT.WithdrawCompleted)) {
      return { kind: 'completed', withdrawal: r.key().toBase58(), user: r.key().toBase58(), amount: r.u64(), xmrAddress: r.str(), xmrTxHash: r.str(), xmrTxKey: r.str() }
    }
    if (isA(data, EVENT.WithdrawReverted)) {
      return { kind: 'reverted', withdrawal: r.key().toBase58(), user: r.key().toBase58(), amount: r.u64(), fee: r.u64(), reason: r.str() }
    }
    if (isA(data, EVENT.WithdrawRequested)) {
      return { kind: 'requested', withdrawal: r.key().toBase58(), user: r.key().toBase58(), nonce: r.u64(), amount: r.u64(), fee: r.u64(), xmrAddress: r.str() }
    }
  } catch {
    return null
  }
  return null
}

export function eventsFromLogs(logs: string[] | null | undefined): BridgeEvent[] {
  const out: BridgeEvent[] = []
  for (const l of logs || []) {
    if (!l.startsWith('Program data: ')) continue
    const e = decodeEvent(l.slice(14).trim())
    if (e) out.push(e)
  }
  return out
}

/* ---------------- instructions ---------------- */

function strBytes(s: string) {
  const b = enc.encode(s)
  const out = new Uint8Array(4 + b.length)
  new DataView(out.buffer).setUint32(0, b.length, true)
  out.set(b, 4)
  return out
}
function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
const w = (pubkey: PublicKey, isSigner = false) => ({ pubkey, isSigner, isWritable: true })
const r = (pubkey: PublicKey) => ({ pubkey, isSigner: false, isWritable: false })

/**
 * Burn `amount` piconero of the user's wXMR and ask the bridge to send real XMR
 * to `xmrAddress`. With exactOut false the bridge fee comes out of `amount`.
 */
export function requestWithdrawalIx(user: PublicKey, nonce: bigint, amount: bigint, xmrAddress: string, exactOut = false) {
  const data = concat(Uint8Array.from(IX.request_withdrawal), u64le(nonce), u64le(amount), strBytes(xmrAddress), Uint8Array.of(exactOut ? 1 : 0))
  return new TransactionInstruction({
    programId: P,
    keys: [
      r(configPda()),
      w(withdrawalPda(user, nonce)),
      w(WXMR_MINT),
      w(ata(user)),
      w(feeTreasuryPda()),
      r(feeOverridePda(user)),
      w(user, true),
      r(TOKEN_PROGRAM),
      r(SystemProgram.programId),
      w(withdrawalStatePda(user)),
    ],
    data: Buffer.from(data),
  })
}

/** Open the user's deposit account; the bridge relayer then assigns it a Monero subaddress. */
export function createDepositAccountIx(user: PublicKey) {
  return new TransactionInstruction({
    programId: P,
    keys: [r(configPda()), w(depositPda(user)), w(user, true), r(SystemProgram.programId)],
    data: Buffer.from(IX.create_deposit_account),
  })
}

/** Move wXMR the bridge minted to the deposit's holding account (no wallet ATA at the time) into the wallet. */
export function claimPendingMintIx(owner: PublicKey) {
  const dep = depositPda(owner)
  return new TransactionInstruction({
    programId: P,
    keys: [
      r(configPda()),
      r(dep),
      w(owner, true),
      w(ata(dep)),
      w(ata(owner)),
      r(WXMR_MINT),
      w(BRIDGE_AUTHORITY),
      r(TOKEN_PROGRAM),
      r(ATA_PROGRAM),
      r(SystemProgram.programId),
    ],
    data: Buffer.from(IX.claim_pending_mint),
  })
}

/** Owner cancels a withdrawal that is still Pending after five minutes; the wXMR comes back. */
export function cancelWithdrawalIx(user: PublicKey, nonce: bigint) {
  return new TransactionInstruction({
    programId: P,
    keys: [
      r(configPda()),
      w(withdrawalPda(user, nonce)),
      w(WXMR_MINT),
      w(ata(user)),
      w(user, true),
      w(BRIDGE_AUTHORITY),
      w(withdrawalStatePda(user)),
      r(TOKEN_PROGRAM),
      r(ATA_PROGRAM),
      r(SystemProgram.programId),
    ],
    data: Buffer.from(IX.cancel_withdrawal),
  })
}

/** Idempotent ATA create (no @solana/spl-token import needed in the browser). */
export function createAtaIdempotentIx(payer: PublicKey, owner: PublicKey, mint: PublicKey = WXMR_MINT) {
  return new TransactionInstruction({
    programId: ATA_PROGRAM,
    keys: [w(payer, true), w(ata(owner, mint)), r(owner), r(mint), r(SystemProgram.programId), r(TOKEN_PROGRAM)],
    data: Buffer.from([1]),
  })
}
