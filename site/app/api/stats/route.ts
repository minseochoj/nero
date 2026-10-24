import { getStats } from '@/lib/server/stats'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  return Response.json(await getStats(), { headers: { 'cache-control': 'public, s-maxage=20, stale-while-revalidate=60' } })
}
