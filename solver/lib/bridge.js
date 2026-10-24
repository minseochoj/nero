// wxmr.io bridge client (engine copy of site/lib/bridge.ts; keep the two in step).
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js'

export const WXMR_MINT = new PublicKey('WXMRyRZhsa19ety5erZhHg4N3xj3EVN92u94422teJp')
export const BRIDGE_PROGRAM = new PublicKey('EzBkC8P5wxab9kwrtV5hRdynHAfB5w3UPcPXNgMseVA8')
export const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
export const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')

const P = BRIDGE_PROGRAM
const seed = (s) => Buffer.from(s)
const u64le = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b }
const pda = (seeds) => PublicKey.findProgramAddressSync(seeds, P)[0]

export const configPda = () => pda([seed('config')])
export const feeTreasuryPda = () => pda([seed('fee_treasury')])
export const feeOverridePda = (u) => pda([seed('fee_override'), u.toBuffer()])
export const withdrawalStatePda = (u) => pda([seed('withdrawal_state'), u.toBuffer()])
export const withdrawalPda = (u, nonce) => pda([seed('withdrawal'), u.toBuffer(), u64le(nonce)])
export const ata = (owner, mint = WXMR_MINT) =>
  PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()], ATA_PROGRAM)[0]

const DISC = {
  request_withdrawal: [251, 85, 121, 205, 56, 201, 12, 177],
  UserWithdrawalState: [206, 93, 63, 106, 34, 146, 231, 230],
  WithdrawalRecord: [88, 59, 154, 202, 216, 210, 211, 237],
  BridgeConfig: [40, 206, 51, 233, 246, 40, 178, 85],
  WithdrawCompleted: [192, 162, 40, 197, 83, 94, 198, 66],
  WithdrawReverted: [41, 94, 186, 33, 56, 24, 133, 80],
  WithdrawRequested: [21, 86, 249, 76, 80, 238, 207, 154],
}
const isA = (b, d) => b.length >= 8 && d.every((x, i) => b[i] === x)

class Reader {
  constructor(b) { this.b = Buffer.from(b); this.o = 8 }
  key() { const k = new PublicKey(this.b.subarray(this.o, this.o + 32)); this.o += 32; return k.toBase58() }
  u8() { return this.b[this.o++] }
  u16() { const v = this.b.readUInt16LE(this.o); this.o += 2; return v }
  u64() { const v = this.b.readBigUInt64LE(this.o); this.o += 8; return v }
  i64() { const v = this.b.readBigInt64LE(this.o); this.o += 8; return v }
  str() { const n = this.b.readUInt32LE(this.o); this.o += 4; const s = this.b.subarray(this.o, this.o + n).toString('utf8'); this.o += n; return s }
}

export function decodeLastNonce(data) {
  if (!isA(data, DISC.UserWithdrawalState)) throw new Error('not a withdrawal state')
  const r = new Reader(data); r.key(); return r.u64()
}
export function decodeConfig(data) {
  if (!isA(data, DISC.BridgeConfig)) throw new Error('not a bridge config')
  const r = new Reader(data)
  const authority = r.key(); const mint = r.key(); const totalDeposits = r.u64(); const totalWithdrawals = r.u64(); r.u8()
  return { authority, mint, totalDeposits, totalWithdrawals, feeBps: r.u16() }
}
export function decodeWithdrawal(data) {
  if (!isA(data, DISC.WithdrawalRecord)) throw new Error('not a withdrawal record')
  const r = new Reader(data)
  const user = r.key(); const nonce = r.u64(); const amount = r.u64(); const xmrAddress = r.str(); r.u8()
  const status = ['pending', 'sending', 'completed'][r.u8()] || 'pending'
  r.u8()
  return { user, nonce, amount, xmrAddress, status, createdAt: Number(r.i64()) }
}

export function nextNonce(lastNonce, now = Date.now()) {
  const min = lastNonce === null ? 1n : lastNonce + 1n
  const t = BigInt(now)
  return min > t ? min : t
}

export function eventsFromLogs(logs) {
  const out = []
  for (const l of logs || []) {
    if (!l.startsWith('Program data: ')) continue
    let b
    try { b = Buffer.from(l.slice(14).trim(), 'base64') } catch { continue }
    const r = new Reader(b)
    try {
      if (isA(b, DISC.WithdrawCompleted)) out.push({ kind: 'completed', withdrawal: r.key(), user: r.key(), amount: r.u64(), xmrAddress: r.str(), xmrTxHash: r.str(), xmrTxKey: r.str() })
      else if (isA(b, DISC.WithdrawReverted)) out.push({ kind: 'reverted', withdrawal: r.key(), user: r.key(), amount: r.u64(), fee: r.u64(), reason: r.str() })
      else if (isA(b, DISC.WithdrawRequested)) out.push({ kind: 'requested', withdrawal: r.key(), user: r.key(), nonce: r.u64(), amount: r.u64(), fee: r.u64(), xmrAddress: r.str() })
    } catch {}
  }
  return out
}

export function requestWithdrawalIx(user, nonce, amount, xmrAddress, exactOut = false) {
  const s = Buffer.from(xmrAddress, 'utf8')
  const len = Buffer.alloc(4); len.writeUInt32LE(s.length)
  const data = Buffer.concat([Buffer.from(DISC.request_withdrawal), u64le(nonce), u64le(amount), len, s, Buffer.from([exactOut ? 1 : 0])])
  const w = (pubkey, isSigner = false) => ({ pubkey, isSigner, isWritable: true })
  const r = (pubkey) => ({ pubkey, isSigner: false, isWritable: false })
  return new TransactionInstruction({
    programId: P,
    keys: [r(configPda()), w(withdrawalPda(user, nonce)), w(WXMR_MINT), w(ata(user)), w(feeTreasuryPda()), r(feeOverridePda(user)), w(user, true), r(TOKEN_PROGRAM), r(SystemProgram.programId), w(withdrawalStatePda(user))],
    data,
  })
}
