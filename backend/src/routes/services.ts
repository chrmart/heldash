import { FastifyInstance } from 'fastify'
import { getDb } from '../db/database'
import { nanoid } from 'nanoid'
import { request, Agent } from 'undici'
import fs from 'fs'
import path from 'path'

const DATA_DIR = process.env.DATA_DIR ?? '/data'

// Reusable agent: accepts self-signed TLS certs (common in homelabs), 5s timeout
const pingAgent = new Agent({
  headersTimeout: 5_000,
  bodyTimeout: 5_000,
  connect: { rejectUnauthorized: false },
})

// ── DB row types ─────────────────────────────────────────────────────────────
interface ServiceRow {
  id: string
  group_id: string | null
  name: string
  url: string
  icon: string | null
  icon_url: string | null
  description: string | null
  tags: string
  check_enabled: number
  check_url: string | null
  check_interval: number
  position_x: number
  position_y: number
  width: number
  height: number
  last_status: string | null
  last_checked: string | null
  created_at: string
  updated_at: string
}

// ── Request body types ───────────────────────────────────────────────────────
interface CreateServiceBody {
  name: string
  url: string
  icon?: string | null
  description?: string | null
  group_id?: string | null
  tags?: string[]
  check_enabled?: boolean
  check_url?: string | null
  check_interval?: number
  position_x?: number
  position_y?: number
  width?: number
  height?: number
}

interface PatchServiceBody {
  name?: string
  url?: string
  icon?: string | null
  icon_url?: string | null
  description?: string | null
  group_id?: string | null
  tags?: string[]
  check_enabled?: boolean
  check_url?: string | null
  check_interval?: number
  position_x?: number
  position_y?: number
  width?: number
  height?: number
}

interface UploadIconBody {
  data: string
  content_type: string
}

export async function servicesRoutes(app: FastifyInstance) {
  const db = getDb()

  // GET /api/services
  app.get('/api/services', async () => {
    return db.prepare('SELECT * FROM services ORDER BY position_y, position_x').all()
  })

  // GET /api/services/:id
  app.get<{ Params: { id: string } }>('/api/services/:id', async (req, reply) => {
    const row = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id) as ServiceRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    return row
  })

  // POST /api/services
  app.post<{ Body: CreateServiceBody }>('/api/services', async (req, reply) => {
    const { name, url, icon, description, group_id, tags, check_enabled, check_url, check_interval, position_x, position_y, width, height } = req.body
    if (!name || !url) return reply.status(400).send({ error: 'name and url are required' })

    const id = nanoid()
    db.prepare(`
      INSERT INTO services (id, group_id, name, url, icon, description, tags, check_enabled, check_url, check_interval, position_x, position_y, width, height)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, group_id ?? null, name, url,
      icon ?? null, description ?? null,
      JSON.stringify(tags ?? []),
      check_enabled !== false ? 1 : 0,
      check_url ?? null,
      check_interval ?? 60,
      position_x ?? 0, position_y ?? 0,
      width ?? 1, height ?? 1
    )

    return reply.status(201).send(db.prepare('SELECT * FROM services WHERE id = ?').get(id))
  })

  // PATCH /api/services/:id
  app.patch<{ Params: { id: string }; Body: PatchServiceBody }>('/api/services/:id', async (req, reply) => {
    const existing = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id) as ServiceRow | undefined
    if (!existing) return reply.status(404).send({ error: 'Not found' })

    const fields: (keyof PatchServiceBody)[] = ['name', 'url', 'icon', 'icon_url', 'description', 'group_id', 'tags', 'check_enabled', 'check_url', 'check_interval', 'position_x', 'position_y', 'width', 'height']
    const updates: string[] = ['updated_at = datetime(\'now\')']
    const values: unknown[] = []

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`)
        if (field === 'tags') {
          values.push(JSON.stringify(req.body[field]))
        } else if (field === 'check_enabled') {
          values.push(req.body[field] ? 1 : 0)
        } else {
          values.push(req.body[field] ?? null)
        }
      }
    }

    values.push(req.params.id)
    db.prepare(`UPDATE services SET ${updates.join(', ')} WHERE id = ?`).run(...values)

    return db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id)
  })

  // DELETE /api/services/:id
  app.delete<{ Params: { id: string } }>('/api/services/:id', async (req, reply) => {
    const existing = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id) as ServiceRow | undefined
    if (!existing) return reply.status(404).send({ error: 'Not found' })
    // Delete icon file if present
    if (existing.icon_url) {
      const filename = path.basename(existing.icon_url)
      const filePath = path.join(DATA_DIR, 'icons', filename)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }
    db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id)
    return reply.status(204).send()
  })

  // POST /api/services/:id/check - manual health check
  app.post<{ Params: { id: string } }>('/api/services/:id/check', async (req, reply) => {
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id) as ServiceRow | undefined
    if (!service) return reply.status(404).send({ error: 'Not found' })

    const checkUrl = service.check_url || service.url
    app.log.debug({ checkUrl }, 'Pinging service')
    const status = await pingService(checkUrl)
    app.log.debug({ checkUrl, status }, 'Ping result')

    db.prepare('UPDATE services SET last_status = ?, last_checked = datetime(\'now\') WHERE id = ?')
      .run(status, req.params.id)

    return { id: service.id, status, checked_at: new Date().toISOString() }
  })

  // POST /api/services/check-all
  app.post('/api/services/check-all', async () => {
    const services = db.prepare('SELECT * FROM services WHERE check_enabled = 1').all() as ServiceRow[]
    const results = await Promise.all(
      services.map(async (s) => {
        const checkUrl = s.check_url || s.url
        const status = await pingService(checkUrl)
        db.prepare('UPDATE services SET last_status = ?, last_checked = datetime(\'now\') WHERE id = ?')
          .run(status, s.id)
        return { id: s.id, status }
      })
    )
    return results
  })

  // POST /api/services/:id/icon - upload icon image (base64 JSON)
  app.post<{ Params: { id: string }; Body: UploadIconBody }>(
    '/api/services/:id/icon',
    async (req, reply) => {
      const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id) as ServiceRow | undefined
      if (!service) return reply.status(404).send({ error: 'Not found' })

      const { data, content_type } = req.body
      if (!data || !content_type) return reply.status(400).send({ error: 'data and content_type required' })

      const extMap: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/svg+xml': 'svg',
      }
      const ext = extMap[content_type]
      if (!ext) return reply.status(415).send({ error: 'Unsupported type. Use PNG, JPG or SVG.' })

      const buffer = Buffer.from(data, 'base64')
      if (buffer.length > 512 * 1024) return reply.status(413).send({ error: 'Image too large (max 512 KB)' })

      const iconsDir = path.join(DATA_DIR, 'icons')
      fs.mkdirSync(iconsDir, { recursive: true })

      // Delete old icon file if it exists and differs from the new one
      if (service.icon_url) {
        const oldFilename = path.basename(service.icon_url)
        const oldPath = path.join(iconsDir, oldFilename)
        if (fs.existsSync(oldPath)) {
          try { fs.unlinkSync(oldPath) } catch { /* ignore */ }
        }
      }

      const filename = `${req.params.id}.${ext}`
      fs.writeFileSync(path.join(iconsDir, filename), buffer)

      const icon_url = `/icons/${filename}`
      db.prepare('UPDATE services SET icon_url = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(icon_url, req.params.id)

      return { icon_url }
    }
  )
}

async function pingService(url: string): Promise<string> {
  try {
    const res = await request(url, {
      method: 'GET',
      dispatcher: pingAgent,
    })
    const status = res.statusCode < 500 ? 'online' : 'offline'
    // Drain response body to release the socket back to the connection pool
    try {
      for await (const _ of res.body) { /* drain */ }
    } catch { /* ignore body read errors */ }
    return status
  } catch {
    return 'offline'
  }
}
