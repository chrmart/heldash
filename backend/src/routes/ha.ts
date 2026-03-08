import { FastifyInstance, FastifyRequest } from 'fastify'
import { nanoid } from 'nanoid'
import { getDb } from '../db/database'
import { isValidHttpUrl } from './_helpers'

// ── DB row types ──────────────────────────────────────────────────────────────

interface HaInstanceRow {
  id: string
  name: string
  url: string
  token: string
  enabled: number
  position: number
  created_at: string
  updated_at: string
}

interface HaPanelRow {
  id: string
  instance_id: string
  entity_id: string
  label: string | null
  panel_type: string
  position: number
  owner_id: string
  created_at: string
}

// ── Request body types ────────────────────────────────────────────────────────

interface CreateInstanceBody {
  name: string
  url: string
  token: string
  enabled?: boolean
}

interface PatchInstanceBody {
  name?: string
  url?: string
  token?: string
  enabled?: boolean
}

interface AddPanelBody {
  instance_id: string
  entity_id: string
  label?: string
  panel_type?: string
}

interface PatchPanelBody {
  label?: string
  panel_type?: string
}

interface ReorderBody {
  ids: string[]
}

interface CallServiceBody {
  domain: string
  service: string
  entity_id: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeInstance(r: HaInstanceRow) {
  return {
    id: r.id,
    name: r.name,
    url: r.url,
    enabled: r.enabled === 1,
    position: r.position,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

function callerOwnerId(req: FastifyRequest): string {
  return req.user?.sub ?? 'guest'
}

async function haFetch(url: string, token: string, path: string, options?: RequestInit): Promise<Response> {
  const base = url.replace(/\/$/, '')
  return fetch(`${base}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function haRoutes(app: FastifyInstance) {
  const db = getDb()

  // GET /api/ha/instances
  app.get('/api/ha/instances', async (req) => {
    try {
      await req.jwtVerify()
    } catch {
      return []
    }
    const rows = db.prepare(
      'SELECT * FROM ha_instances ORDER BY position ASC, created_at ASC'
    ).all() as HaInstanceRow[]
    if (req.user.role !== 'admin') {
      return rows.filter(r => r.enabled === 1).map(sanitizeInstance)
    }
    return rows.map(sanitizeInstance)
  })

  // POST /api/ha/instances
  app.post<{ Body: CreateInstanceBody }>('/api/ha/instances', {
    preHandler: [app.requireAdmin],
  }, async (req, reply) => {
    const { name, url, token, enabled = true } = req.body
    if (!name?.trim()) return reply.status(400).send({ error: 'name is required' })
    if (!url?.trim()) return reply.status(400).send({ error: 'url is required' })
    if (!token?.trim()) return reply.status(400).send({ error: 'token is required' })
    if (!isValidHttpUrl(url)) return reply.status(400).send({ error: 'Invalid URL — must be http or https' })
    const id = nanoid()
    const maxRow = db.prepare('SELECT MAX(position) as m FROM ha_instances').get() as { m: number | null }
    const position = (maxRow.m ?? -1) + 1
    db.prepare(`
      INSERT INTO ha_instances (id, name, url, token, enabled, position)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name.trim(), url.replace(/\/$/, ''), token.trim(), enabled ? 1 : 0, position)
    const row = db.prepare('SELECT * FROM ha_instances WHERE id = ?').get(id) as HaInstanceRow
    return sanitizeInstance(row)
  })

  // PATCH /api/ha/instances/:id
  app.patch<{ Params: { id: string }; Body: PatchInstanceBody }>('/api/ha/instances/:id', {
    preHandler: [app.requireAdmin],
  }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM ha_instances WHERE id = ?').get(req.params.id) as HaInstanceRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    const name = req.body.name?.trim() ?? row.name
    const url = (req.body.url?.trim() ?? row.url).replace(/\/$/, '')
    if (req.body.url !== undefined && !isValidHttpUrl(url)) {
      return reply.status(400).send({ error: 'Invalid URL — must be http or https' })
    }
    const token = req.body.token?.trim() || row.token
    const enabled = req.body.enabled !== undefined ? (req.body.enabled ? 1 : 0) : row.enabled
    db.prepare(`
      UPDATE ha_instances SET name=?, url=?, token=?, enabled=?, updated_at=datetime('now') WHERE id=?
    `).run(name, url, token, enabled, row.id)
    const updated = db.prepare('SELECT * FROM ha_instances WHERE id = ?').get(row.id) as HaInstanceRow
    return sanitizeInstance(updated)
  })

  // DELETE /api/ha/instances/:id
  app.delete<{ Params: { id: string } }>('/api/ha/instances/:id', {
    preHandler: [app.requireAdmin],
  }, async (req, reply) => {
    const row = db.prepare('SELECT id FROM ha_instances WHERE id = ?').get(req.params.id)
    if (!row) return reply.status(404).send({ error: 'Not found' })
    db.prepare('DELETE FROM ha_panels WHERE instance_id = ?').run(req.params.id)
    db.prepare('DELETE FROM ha_instances WHERE id = ?').run(req.params.id)
    return reply.status(204).send()
  })

  // POST /api/ha/instances/:id/test
  app.post<{ Params: { id: string } }>('/api/ha/instances/:id/test', {
    preHandler: [app.requireAdmin],
  }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM ha_instances WHERE id = ?').get(req.params.id) as HaInstanceRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    try {
      const res = await haFetch(row.url, row.token, '/api/')
      if (res.ok) return { ok: true }
      return { ok: false, error: `HA returned HTTP ${res.status}` }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed'
      return { ok: false, error: msg }
    }
  })

  // GET /api/ha/instances/:id/states — proxy all HA states for entity browser
  app.get<{ Params: { id: string } }>('/api/ha/instances/:id/states', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM ha_instances WHERE id = ?').get(req.params.id) as HaInstanceRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    if (!row.enabled) return reply.status(400).send({ error: 'Instance disabled' })
    try {
      const res = await haFetch(row.url, row.token, '/api/states')
      if (!res.ok) return reply.status(502).send({ error: `HA returned HTTP ${res.status}` })
      const data = await res.json()
      return data
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed'
      return reply.status(502).send({ error: msg })
    }
  })

  // POST /api/ha/instances/:id/call — proxy a HA service call
  app.post<{ Params: { id: string }; Body: CallServiceBody }>('/api/ha/instances/:id/call', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM ha_instances WHERE id = ?').get(req.params.id) as HaInstanceRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    const { domain, service, entity_id } = req.body
    if (!domain || !service || !entity_id) {
      return reply.status(400).send({ error: 'domain, service, entity_id are required' })
    }
    try {
      const res = await haFetch(row.url, row.token, `/api/services/${domain}/${service}`, {
        method: 'POST',
        body: JSON.stringify({ entity_id }),
      })
      if (!res.ok) return reply.status(502).send({ error: `HA returned HTTP ${res.status}` })
      return { ok: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed'
      return reply.status(502).send({ error: msg })
    }
  })

  // GET /api/ha/panels — list panels for caller
  app.get('/api/ha/panels', async (req) => {
    let ownerId = 'guest'
    try {
      await req.jwtVerify()
      ownerId = callerOwnerId(req)
    } catch { /* unauthenticated = guest */ }
    const rows = db.prepare(
      'SELECT * FROM ha_panels WHERE owner_id = ? ORDER BY position ASC'
    ).all(ownerId) as HaPanelRow[]
    return rows
  })

  // POST /api/ha/panels — add a panel
  app.post<{ Body: AddPanelBody }>('/api/ha/panels', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const ownerId = callerOwnerId(req)
    const { instance_id, entity_id, label, panel_type = 'auto' } = req.body
    if (!instance_id?.trim()) return reply.status(400).send({ error: 'instance_id is required' })
    if (!entity_id?.trim()) return reply.status(400).send({ error: 'entity_id is required' })
    const inst = db.prepare('SELECT id FROM ha_instances WHERE id = ?').get(instance_id)
    if (!inst) return reply.status(404).send({ error: 'Instance not found' })
    const existing = db.prepare(
      'SELECT id FROM ha_panels WHERE owner_id = ? AND instance_id = ? AND entity_id = ?'
    ).get(ownerId, instance_id, entity_id)
    if (existing) return reply.status(409).send({ error: 'Panel already added' })
    const id = nanoid()
    const maxRow = db.prepare('SELECT MAX(position) as m FROM ha_panels WHERE owner_id = ?').get(ownerId) as { m: number | null }
    const position = (maxRow.m ?? -1) + 1
    db.prepare(`
      INSERT INTO ha_panels (id, instance_id, entity_id, label, panel_type, position, owner_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, instance_id, entity_id.trim(), label?.trim() ?? null, panel_type, position, ownerId)
    return db.prepare('SELECT * FROM ha_panels WHERE id = ?').get(id) as HaPanelRow
  })

  // PATCH /api/ha/panels/reorder — must be registered BEFORE /:id
  app.patch<{ Body: ReorderBody }>('/api/ha/panels/reorder', {
    preHandler: [app.authenticate],
  }, async (req) => {
    const ownerId = callerOwnerId(req)
    const { ids } = req.body
    if (!Array.isArray(ids)) return { ok: false }
    const update = db.prepare('UPDATE ha_panels SET position = ? WHERE id = ? AND owner_id = ?')
    db.transaction(() => {
      ids.forEach((id, idx) => update.run(idx, id, ownerId))
    })()
    return { ok: true }
  })

  // PATCH /api/ha/panels/:id — update label / panel_type
  app.patch<{ Params: { id: string }; Body: PatchPanelBody }>('/api/ha/panels/:id', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const ownerId = callerOwnerId(req)
    const row = db.prepare(
      'SELECT * FROM ha_panels WHERE id = ? AND owner_id = ?'
    ).get(req.params.id, ownerId) as HaPanelRow | undefined
    if (!row) return reply.status(404).send({ error: 'Not found' })
    const label = req.body.label !== undefined ? (req.body.label.trim() || null) : row.label
    const panel_type = req.body.panel_type ?? row.panel_type
    db.prepare('UPDATE ha_panels SET label=?, panel_type=? WHERE id=?').run(label, panel_type, row.id)
    return db.prepare('SELECT * FROM ha_panels WHERE id = ?').get(row.id) as HaPanelRow
  })

  // DELETE /api/ha/panels/:id
  app.delete<{ Params: { id: string } }>('/api/ha/panels/:id', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const ownerId = callerOwnerId(req)
    const row = db.prepare('SELECT id FROM ha_panels WHERE id = ? AND owner_id = ?').get(req.params.id, ownerId)
    if (!row) return reply.status(404).send({ error: 'Not found' })
    db.prepare('DELETE FROM ha_panels WHERE id = ?').run(req.params.id)
    return reply.status(204).send()
  })
}
