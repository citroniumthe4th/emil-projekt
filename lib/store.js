// On Vercel: chat state in Upstash Redis, images in Vercel Blob.
// Locally (no env vars): everything goes to ./.data so you can try it without setup.
import { Redis } from '@upstash/redis'
import { put } from '@vercel/blob'
import fs from 'fs/promises'
import path from 'path'

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
const redis = url && token ? new Redis({ url, token }) : null
const DIR = path.join(process.cwd(), '.data')

export async function load() {
  if (redis) return redis.get('state')
  try {
    return JSON.parse(await fs.readFile(path.join(DIR, 'state.json'), 'utf8'))
  } catch {
    return null
  }
}

// ponytail: whole state is rewritten on every change; fine for one story, split per-message if it grows past a few MB
export async function save(state) {
  if (redis) return redis.set('state', state)
  await fs.mkdir(DIR, { recursive: true })
  await fs.writeFile(path.join(DIR, 'state.json'), JSON.stringify(state))
}

export async function saveImage(file) {
  const name = `${crypto.randomUUID()}.jpg`
  if (process.env.BLOB_READ_WRITE_TOKEN) return (await put(name, file, { access: 'public' })).url
  await fs.mkdir(path.join(DIR, 'uploads'), { recursive: true })
  await fs.writeFile(path.join(DIR, 'uploads', name), Buffer.from(await file.arrayBuffer()))
  return `/api/upload?f=${name}`
}

export function readLocalImage(name) {
  return fs.readFile(path.join(DIR, 'uploads', path.basename(name)))
}
