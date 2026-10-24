import { ExitError, exitQuote } from '@/lib/server/exit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const u = new URL(req.url)
  try {
    const q = await exitQuote({ inputMint: u.searchParams.get('in') || '', amount: u.searchParams.get('amount') || '', slippageBps: Number(u.searchParams.get('slip') || 100) })
    return Response.json(q, { headers: { 'cache-control': 'no-store' } })
  } catch (e: any) {
    const status = e instanceof ExitError ? e.status : 502
    return Response.json({ error: e instanceof ExitError ? e.message : 'No quote right now. Try again.' }, { status })
  }
}
