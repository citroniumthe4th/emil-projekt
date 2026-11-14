import { load, save } from '../../../lib/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json(await load())
}

// Every save carries the version it was based on. If someone else saved in between, refuse and
// send back the latest state instead of overwriting their changes.
export async function PUT(req) {
  const next = await req.json()
  const saved = await load()
  // ponytail: check-then-write isn't atomic, so two saves in the same instant could both pass; fine for a few people
  if ((saved?.v ?? 0) !== (next.v ?? 0)) return Response.json(saved, { status: 409 })
  next.v = (next.v ?? 0) + 1
  await save(next)
  return Response.json({ v: next.v })
}
