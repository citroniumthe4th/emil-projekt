import { saveImage, readLocalImage } from '../../../lib/store'

export async function POST(req) {
  const file = (await req.formData()).get('file')
  if (!file) return new Response('No file', { status: 400 })
  return Response.json({ url: await saveImage(file) })
}

// Serves locally stored images (only used when Blob isn't configured)
export async function GET(req) {
  try {
    const buf = await readLocalImage(new URL(req.url).searchParams.get('f') || '')
    return new Response(buf, { headers: { 'content-type': 'image/jpeg' } })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
