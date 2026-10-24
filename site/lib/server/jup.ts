/*
  Jupiter Swap API (v1). Quotes route any Solana token into wXMR; the
  swap-instructions endpoint gives raw instructions so the swap and the bridge
  withdrawal can share one transaction and one signature.
*/
import { PublicKey, TransactionInstruction } from '@solana/web3.js'

const JUP = process.env.JUP_API_URL || 'https://lite-api.jup.ag/swap/v1'
const JUP_KEY = process.env.JUP_API_KEY || ''

export type JupQuote = {
  inputMint: string; outputMint: string; inAmount: string; outAmount: string; otherAmountThreshold: string
  swapMode: string; slippageBps: number; priceImpactPct: string; platformFee: { amount: string; feeBps: number } | null
  routePlan: { swapInfo: { label: string } ; percent: number }[]
  [k: string]: unknown
}

type RawIx = { programId: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; data: string }
export type JupInstructions = {
  computeBudgetInstructions: RawIx[]
  setupInstructions: RawIx[]
  swapInstruction: RawIx
  cleanupInstruction: RawIx | null
  otherInstructions: RawIx[]
  addressLookupTableAddresses: string[]
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${JUP}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(JUP_KEY ? { 'x-api-key': JUP_KEY } : {}), ...(init?.headers || {}) },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || (j as any).error) throw new Error((j as any).error || (j as any).errorCode || `Jupiter ${r.status}`)
  return j as T
}

export function quote(p: { inputMint: string; outputMint: string; amount: string; slippageBps: number; feeBps: number; maxAccounts: number }) {
  const q = new URLSearchParams({
    inputMint: p.inputMint, outputMint: p.outputMint, amount: p.amount, slippageBps: String(p.slippageBps),
    restrictIntermediateTokens: 'true', maxAccounts: String(p.maxAccounts),
  })
  if (p.feeBps > 0) q.set('platformFeeBps', String(p.feeBps))
  return call<JupQuote>(`/quote?${q}`)
}

export function swapInstructions(quoteResponse: JupQuote, userPublicKey: string, feeAccount: string | null) {
  return call<JupInstructions>('/swap-instructions', {
    method: 'POST',
    body: JSON.stringify({
      quoteResponse, userPublicKey, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true,
      ...(feeAccount ? { feeAccount } : {}),
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 2_000_000, priorityLevel: 'high' } },
    }),
  })
}

export function toIx(ix: RawIx): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
    data: Buffer.from(ix.data, 'base64'),
  })
}

export async function usdPrices(mints: string[]): Promise<Record<string, number>> {
  try {
    const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${mints.join(',')}`, { cache: 'no-store', signal: AbortSignal.timeout(8_000) })
    const j = await r.json()
    const out: Record<string, number> = {}
    for (const m of mints) if (j?.[m]?.usdPrice) out[m] = Number(j[m].usdPrice)
    return out
  } catch {
    return {}
  }
}
