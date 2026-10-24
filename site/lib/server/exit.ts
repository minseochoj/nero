/*
  The exit: any Solana token -> real XMR, one transaction, one signature.

    [compute budget] [Jupiter setup] [Jupiter swap -> wXMR] [Jupiter cleanup]
    [bridge request_withdrawal(amount = the swap's guaranteed minimum)]

  Asking the bridge for the swap's slippage floor means the withdrawal can never
  ask for more wXMR than the swap is guaranteed to deliver; anything above the
  floor stays in the wallet as wXMR. If either half fails, the whole transaction
  fails and nothing moves.
*/
import {
  AddressLookupTableAccount, ComputeBudgetProgram, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction,
} from '@solana/web3.js'
import { ata, decodeConfig, decodeLastNonce, configPda, nextNonce, requestWithdrawalIx, withdrawalPda, withdrawalStatePda } from '../bridge'
import { MIN_WITHDRAW_PICO, PLATFORM_FEE_BPS, WXMR_MINT } from '../constants'
import { checkMoneroAddress } from '../monero'
import { serverConnection } from './rpc'
import { quote, swapInstructions, toIx, type JupQuote } from './jup'

export class ExitError extends Error {
  constructor(message: string, public status = 400, public detail?: unknown) { super(message) }
}

const COMPUTE_BUDGET = ComputeBudgetProgram.programId.toBase58()
const BRIDGE_CU = 70_000

/** The wXMR account Jupiter pays Nero's fee into: the fee owner's ATA, if it exists. */
let feeCache: { at: number; account: string | null } = { at: 0, account: null }
export async function feeAccount(): Promise<string | null> {
  const owner = process.env.FEE_OWNER
  if (!owner) return null
  if (Date.now() - feeCache.at < 60_000) return feeCache.account
  const a = ata(new PublicKey(owner))
  const info = await serverConnection().getAccountInfo(a).catch(() => null)
  feeCache = { at: Date.now(), account: info ? a.toBase58() : null }
  return feeCache.account
}

export async function bridgeFeeBps(): Promise<number> {
  const info = await serverConnection().getAccountInfo(configPda())
  if (!info) throw new ExitError('bridge config unreadable', 502)
  return decodeConfig(info.data).feeBps
}

export type ExitQuote = {
  inputMint: string; inAmount: string; outAmount: string; minOut: string; platformFee: string
  bridgeFeeBps: number; xmrOut: string; xmrOutMin: string; priceImpactPct: number; route: string[]; ok: boolean; reason?: string
}

/** What the wallet would get: the bridge sends `amount - fee`, where amount is the swap floor. */
export function summarize(q: JupQuote, bridgeBps: number): ExitQuote {
  const out = BigInt(q.outAmount)
  const min = BigInt(q.otherAmountThreshold)
  const net = (x: bigint) => x - (x * BigInt(bridgeBps)) / 10_000n
  const ok = min >= MIN_WITHDRAW_PICO
  return {
    inputMint: q.inputMint, inAmount: q.inAmount, outAmount: q.outAmount, minOut: q.otherAmountThreshold,
    platformFee: q.platformFee?.amount || '0', bridgeFeeBps: bridgeBps,
    xmrOut: net(out).toString(), xmrOutMin: net(min).toString(),
    priceImpactPct: Number(q.priceImpactPct) * 100,
    route: q.routePlan.map((r) => r.swapInfo.label),
    ok, ...(ok ? {} : { reason: 'The bridge sends at least 0.1 XMR. Raise the amount.' }),
  }
}

function parseIn(p: { inputMint: string; amount: string; slippageBps?: number }) {
  let mint: PublicKey
  try { mint = new PublicKey(p.inputMint) } catch { throw new ExitError('unknown token') }
  if (mint.equals(WXMR_MINT)) throw new ExitError('already wXMR: use the bridge withdraw directly')
  if (!/^\d{1,30}$/.test(String(p.amount)) || BigInt(p.amount) <= 0n) throw new ExitError('enter an amount')
  const slippageBps = Math.round(Number(p.slippageBps ?? 100))
  if (!(slippageBps >= 10 && slippageBps <= 500)) throw new ExitError('slippage must be 0.1%..5%')
  return { mint: mint.toBase58(), amount: String(BigInt(p.amount)), slippageBps }
}

export async function exitQuote(p: { inputMint: string; amount: string; slippageBps?: number }) {
  const { mint, amount, slippageBps } = parseIn(p)
  const fee = await feeAccount()
  const [q, bps] = await Promise.all([
    quote({ inputMint: mint, outputMint: WXMR_MINT.toBase58(), amount, slippageBps, feeBps: fee ? PLATFORM_FEE_BPS : 0, maxAccounts: 40 }),
    bridgeFeeBps(),
  ])
  return summarize(q, bps)
}

const MAX_TX_BYTES = 1232
const WALLET_ROOM = Number(process.env.WALLET_ROOM_BYTES || 150)
const ACCOUNT_BUDGETS = (process.env.ACCOUNT_BUDGETS || '40,32,26,20,16').split(',').map(Number)

export async function buildExit(p: { wallet: string; inputMint: string; amount: string; xmrAddress: string; slippageBps?: number }) {
  const { mint, amount, slippageBps } = parseIn(p)
  let user: PublicKey
  try { user = new PublicKey(p.wallet) } catch { throw new ExitError('connect a Solana wallet') }
  const xmr = String(p.xmrAddress || '').trim()
  const check = checkMoneroAddress(xmr)
  if (!check.ok) throw new ExitError(check.reason)

  const conn = serverConnection()
  const fee = await feeAccount()
  const bps = await bridgeFeeBps()
  const stateInfo = await conn.getAccountInfo(withdrawalStatePda(user))
  const nonce = nextNonce(stateInfo ? decodeLastNonce(stateInfo.data) : null)

  // Wallets add their own guard instruction before signing (Phantom's is ~60-110 bytes). A transaction that
  // leaves no room for it gets a "this dApp could be malicious" warning, so stay WALLET_ROOM under the limit.
  // Smaller routes fit when the full one does not; try a few account budgets.
  let lastErr: unknown = null
  for (const maxAccounts of ACCOUNT_BUDGETS) {
    const q = await quote({ inputMint: mint, outputMint: WXMR_MINT.toBase58(), amount, slippageBps, feeBps: fee ? PLATFORM_FEE_BPS : 0, maxAccounts })
    const summary = summarize(q, bps)
    if (!summary.ok) throw new ExitError(summary.reason!, 400, summary)
    const minOut = BigInt(q.otherAmountThreshold)
    const ji = await swapInstructions(q, user.toBase58(), fee)

    // Jupiter's simulated CU limit covers the swap; add room for the bridge call.
    const budget: TransactionInstruction[] = []
    let sawLimit = false
    for (const raw of ji.computeBudgetInstructions) {
      const ix = toIx(raw)
      if (raw.programId === COMPUTE_BUDGET && ix.data[0] === 2) {
        const units = ix.data.readUInt32LE(1) + BRIDGE_CU
        budget.push(ComputeBudgetProgram.setComputeUnitLimit({ units: Math.min(units, 1_400_000) }))
        sawLimit = true
      } else budget.push(ix)
    }
    if (!sawLimit) budget.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }))

    const ixs = [
      ...budget,
      ...ji.otherInstructions.map(toIx),
      ...ji.setupInstructions.map(toIx),
      toIx(ji.swapInstruction),
      ...(ji.cleanupInstruction ? [toIx(ji.cleanupInstruction)] : []),
      requestWithdrawalIx(user, nonce, minOut, xmr, false),
    ]
    const alts = (await Promise.all(ji.addressLookupTableAddresses.map((a) => conn.getAddressLookupTable(new PublicKey(a)))))
      .map((r) => r.value).filter((v): v is AddressLookupTableAccount => !!v)
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed')
    const msg = new TransactionMessage({ payerKey: user, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message(alts)
    const tx = new VersionedTransaction(msg)
    let bytes: Uint8Array
    try {
      bytes = tx.serialize()
      if (bytes.length > MAX_TX_BYTES - WALLET_ROOM) throw new Error(`too large (${bytes.length} bytes)`)
    } catch (e) {
      lastErr = e
      continue
    }
    const sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: false, commitment: 'confirmed' })
    if (sim.value.err) {
      const logs = (sim.value.logs || []).slice(-8)
      throw new ExitError(simReason(sim.value.err, logs), 400, { err: sim.value.err, logs })
    }
    return {
      tx: Buffer.from(bytes).toString('base64'),
      bytes: bytes.length,
      units: sim.value.unitsConsumed,
      lastValidBlockHeight,
      nonce: nonce.toString(),
      withdrawal: withdrawalPda(user, nonce).toBase58(),
      xmrAddress: xmr,
      quote: summary,
    }
  }
  throw new ExitError('No route small enough for one transaction right now. Try a different amount or token.', 400, String(lastErr))
}

function simReason(err: unknown, logs: string[]): string {
  const s = JSON.stringify(err) + ' ' + logs.join(' ')
  if (/insufficient lamports|Attempt to debit an account but found no record|0x1\b|insufficient funds/i.test(s)) return 'Not enough balance for this amount plus network fees.'
  if (/0x1771|SlippageToleranceExceeded|6001/.test(s)) return 'The price moved. Try again, or raise slippage.'
  if (/InvalidXmrAddress|6000/.test(s)) return 'The bridge rejected that Monero address.'
  if (/WithdrawalTooSmall|6013/.test(s)) return 'The bridge sends at least 0.1 XMR. Raise the amount.'
  return 'The transaction would fail right now. Try again in a moment.'
}
