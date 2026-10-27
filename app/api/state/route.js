import { load, save } from '../../../lib/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json(await load())
}

export async function PUT(req) {
  await save(await req.json())
  return Response.json({ ok: true })
}
