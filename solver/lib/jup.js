// Jupiter Swap API v1 (raw instructions so the burn can share the swap's transaction).
import { PublicKey, TransactionInstruction } from '@solana/web3.js'

// Free Jupiter endpoints, tried in order: a 429/5xx or network error on one falls through to the next.
// (lite-api throttles busy server IPs; api.jup.ag serves the same Swap API v1.)
const JUPS = (process.env.JUP_API_URLS || process.env.JUP_API_URL || 'https://lite-api.jup.ag/swap/v1,https://api.jup.ag/swap/v1').split(',').map((s) => s.trim()).filter(Boolean)
const KEY = process.env.JUP_API_KEY || ''

async function call(path, init) {
  let last
  for (const base of JUPS) {
    try {
      const r = await fetch(`${base}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', ...(KEY ? { 'x-api-key': KEY } : {}) },
        signal: AbortSignal.timeout(15_000),
      })
      if (r.status === 429 || r.status >= 500) { last = new Error(`Jupiter ${r.status} at ${base}`); continue }
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j.error) throw new Error(j.error || `Jupiter ${r.status}`)
      return j
    } catch (e) {
      if (/Jupiter \d+$/.test(e.message) && !/ at /.test(e.message)) throw e // a real 4xx answer: don't retry elsewhere
      last = e
    }
  }
  throw last
}

export const quote = ({ inputMint, outputMint, amount, slippageBps, maxAccounts = 40 }) =>
  call(`/quote?${new URLSearchParams({ inputMint, outputMint, amount: String(amount), slippageBps: String(slippageBps), restrictIntermediateTokens: 'true', maxAccounts: String(maxAccounts) })}`)

export const swapInstructions = (quoteResponse, userPublicKey, { wrapAndUnwrapSol = true } = {}) =>
  call('/swap-instructions', { method: 'POST', body: JSON.stringify({ quoteResponse, userPublicKey, wrapAndUnwrapSol, dynamicComputeUnitLimit: true }) })

export const toIx = (ix) => new TransactionInstruction({
  programId: new PublicKey(ix.programId),
  keys: ix.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
  data: Buffer.from(ix.data, 'base64'),
})
