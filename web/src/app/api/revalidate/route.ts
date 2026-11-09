import { timingSafeEqual } from 'node:crypto'
import { revalidatePath } from 'next/cache'

function secretMatches(provided: string | null, expected: string | undefined): boolean {
  if (!expected || !provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(request: Request): Promise<Response> {
  if (!secretMatches(request.headers.get('x-revalidate-secret'), process.env.REVALIDATE_SECRET)) {
    return Response.json({ revalidated: false }, { status: 401 })
  }
  revalidatePath('/', 'layout')
  return Response.json({ revalidated: true })
}
