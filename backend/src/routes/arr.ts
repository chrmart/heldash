import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { nanoid } from 'nanoid'
import { getDb } from '../db/database'
import { RadarrClient } from '../arr/radarr'
import { SonarrClient } from '../arr/sonarr'
import { ProwlarrClient } from '../arr/prowlarr'
import { SabnzbdClient } from '../arr/sabnzbd'

// ── DB row type ───────────────────────────────────────────────────────────────
interface ArrInstanceRow {
  id: string
  type: string
  name: string
  url: string
  api_key: string
  enabled: number
  position: number
  created_at: string
  updated_at: string
}

// ── Request body types ────────────────────────────────────────────────────────
interface CreateInstanceBody {
  type: string
  name: string
  url: string
  api_key: string
  enabled?: boolean
  position?: number
}

interface PatchInstanceBody {
  name?: string
  url?: string
  api_key?: string
  enabled?: boolean
  position?: number
}

interface VisibilityBody {
  hidden_instance_ids: string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Never return the API key to the client */
function sanitize(r: ArrInstanceRow) {
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    url: r.url,
    enabled: r.enabled === 1,
    position: r.position,
    created_at: r.created_at,
  }
}

/** Attempt to extract the caller's groupId without requiring auth */
async function callerGroupId(req: FastifyRequest): Promise<string> {
  try {
    await req.jwtVerify()
    return req.user.groupId ?? 'grp_guest'
  } catch {
    return 'grp_guest'
  }
}

function calendarRange() {
  const start = new Date()
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

export async function arrRoutes(app: FastifyInstance) {
  const db = getDb()

  function isVisibleToGroup(instanceId: string, groupId: string): boolean {
    if (groupId === 'grp_admin') return true
    return !db.prepare(
      'SELECT 1 FROM group_arr_visibility WHERE group_id = ? AND instance_id = ?'
    ).get(groupId, instanceId)
  }

  /** Resolve an instance and enforce group visibility; sends error reply and returns null on failure */
  async function resolveInstance(
    req: FastifyRequest,
    reply: FastifyReply,
    id: string,
  ): Promise<ArrInstanceRow | null> {
    const groupId = await callerGroupId(req)
    const row = db.prepare(
      'SELECT * FROM arr_instances WHERE id = ? AND enabled = 1'
    ).get(id) as ArrInstanceRow | undefined

    if (!row) { reply.status(404).send({ error: 'Not found' }); return null }
    if (!isVisibleToGroup(id, groupId)) { reply.status(403).send({ error: 'Forbidden' }); return null }
    return row
  }

  function makeClient(row: ArrInstanceRow): RadarrClient | SonarrClient | ProwlarrClient {
    if (row.type === 'radarr') return new RadarrClient(row.url, row.api_key)
    if (row.type === 'sonarr') return new SonarrClient(row.url, row.api_key)
    if (row.type === 'prowlarr') return new ProwlarrClient(row.url, row.api_key)
    throw new Error(`makeClient called for unsupported type: ${row.type}`)
  }

  // ── Instance CRUD (admin-only) ─────────────────────────────────────────────

  // GET /api/arr/instances — visible to caller's group; public (filtered)
  app.get('/api/arr/instances', async (req) => {
    const groupId = await callerGroupId(req)
    const all = db.prepare(
      'SELECT * FROM arr_instances ORDER BY position, type, name'
    ).all() as ArrInstanceRow[]

    if (groupId === 'grp_admin') return all.map(sanitize)

    const hidden = new Set(
      (db.prepare(
        'SELECT instance_id FROM group_arr_visibility WHERE group_id = ?'
      ).all(groupId) as { instance_id: string }[]).map(r => r.instance_id)
    )
    return all.filter(r => !hidden.has(r.id)).map(sanitize)
  })

  // POST /api/arr/instances
  app.post<{ Body: CreateInstanceBody }>(
    '/api/arr/instances',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const { type, name, url, api_key, enabled = true, position = 0 } = req.body
      if (!['radarr', 'sonarr', 'prowlarr', 'sabnzbd'].includes(type)) {
        return reply.status(400).send({ error: 'type must be radarr, sonarr, prowlarr or sabnzbd' })
      }
      if (!name?.trim() || !url?.trim() || !api_key?.trim()) {
        return reply.status(400).send({ error: 'name, url and api_key are required' })
      }

      const id = nanoid()
      db.prepare(`
        INSERT INTO arr_instances (id, type, name, url, api_key, enabled, position)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, type, name.trim(), url.trim().replace(/\/$/, ''), api_key.trim(), enabled ? 1 : 0, position)

      const row = db.prepare('SELECT * FROM arr_instances WHERE id = ?').get(id) as ArrInstanceRow
      return reply.status(201).send(sanitize(row))
    }
  )

  // PATCH /api/arr/instances/:id
  app.patch<{ Params: { id: string }; Body: PatchInstanceBody }>(
    '/api/arr/instances/:id',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const row = db.prepare('SELECT * FROM arr_instances WHERE id = ?').get(req.params.id) as ArrInstanceRow | undefined
      if (!row) return reply.status(404).send({ error: 'Not found' })

      const updates: string[] = ["updated_at = datetime('now')"]
      const values: unknown[] = []
      const { name, url, api_key, enabled, position } = req.body

      if (name !== undefined) { updates.push('name = ?'); values.push(name.trim()) }
      if (url !== undefined) { updates.push('url = ?'); values.push(url.trim().replace(/\/$/, '')) }
      if (api_key !== undefined) { updates.push('api_key = ?'); values.push(api_key.trim()) }
      if (enabled !== undefined) { updates.push('enabled = ?'); values.push(enabled ? 1 : 0) }
      if (position !== undefined) { updates.push('position = ?'); values.push(position) }

      values.push(req.params.id)
      db.prepare(`UPDATE arr_instances SET ${updates.join(', ')} WHERE id = ?`).run(...values)

      const updated = db.prepare('SELECT * FROM arr_instances WHERE id = ?').get(req.params.id) as ArrInstanceRow
      return sanitize(updated)
    }
  )

  // DELETE /api/arr/instances/:id
  app.delete<{ Params: { id: string } }>(
    '/api/arr/instances/:id',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      if (!db.prepare('SELECT id FROM arr_instances WHERE id = ?').get(req.params.id)) {
        return reply.status(404).send({ error: 'Not found' })
      }
      db.prepare('DELETE FROM group_arr_visibility WHERE instance_id = ?').run(req.params.id)
      db.prepare('DELETE FROM arr_instances WHERE id = ?').run(req.params.id)
      return reply.status(204).send()
    }
  )

  // PUT /api/arr/groups/:groupId/visibility — set hidden instances for a user group
  app.put<{ Params: { groupId: string }; Body: VisibilityBody }>(
    '/api/arr/groups/:groupId/visibility',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      if (!db.prepare('SELECT id FROM user_groups WHERE id = ?').get(req.params.groupId)) {
        return reply.status(404).send({ error: 'Not found' })
      }
      const { hidden_instance_ids } = req.body
      db.prepare('DELETE FROM group_arr_visibility WHERE group_id = ?').run(req.params.groupId)
      const insert = db.prepare(
        'INSERT INTO group_arr_visibility (group_id, instance_id) VALUES (?, ?)'
      )
      for (const instanceId of hidden_instance_ids) {
        insert.run(req.params.groupId, instanceId)
      }
      return { ok: true, hidden_instance_ids }
    }
  )

  // ── Proxy routes ───────────────────────────────────────────────────────────

  // GET /api/arr/:id/status
  app.get<{ Params: { id: string } }>('/api/arr/:id/status', async (req, reply) => {
    const row = await resolveInstance(req, reply, req.params.id)
    if (!row) return
    try {
      if (row.type === 'sabnzbd') {
        const { version } = await new SabnzbdClient(row.url, row.api_key).getVersion()
        return { online: true, type: 'sabnzbd', version }
      }
      const status = await makeClient(row).getSystemStatus()
      return { online: true, type: row.type, ...status }
    } catch {
      return { online: false, type: row.type }
    }
  })

  // GET /api/arr/:id/stats
  app.get<{ Params: { id: string } }>('/api/arr/:id/stats', async (req, reply) => {
    const row = await resolveInstance(req, reply, req.params.id)
    if (!row) return
    try {
      if (row.type === 'sabnzbd') {
        // limit=1 to minimise payload; noofslots always reflects total count
        const { queue } = await new SabnzbdClient(row.url, row.api_key).getQueue(0, 1)
        return {
          type: 'sabnzbd',
          speed: queue.speed,
          mbleft: parseFloat(queue.mbleft),
          mb: parseFloat(queue.mb),
          paused: queue.paused,
          queueCount: queue.noofslots,
          diskspaceFreeGb: parseFloat(queue.diskspace1),
        }
      }
      if (row.type === 'radarr') {
        const movies = await new RadarrClient(row.url, row.api_key).getMovies()
        return {
          type: 'radarr',
          movieCount: movies.length,
          monitored: movies.filter(m => m.monitored).length,
          withFile: movies.filter(m => m.hasFile).length,
          sizeOnDisk: movies.reduce((a, m) => a + (m.sizeOnDisk ?? 0), 0),
        }
      }
      if (row.type === 'sonarr') {
        const series = await new SonarrClient(row.url, row.api_key).getSeries()
        return {
          type: 'sonarr',
          seriesCount: series.length,
          monitored: series.filter(s => s.monitored).length,
          episodeCount: series.reduce((a, s) => a + (s.statistics?.episodeFileCount ?? 0), 0),
          sizeOnDisk: series.reduce((a, s) => a + (s.statistics?.sizeOnDisk ?? 0), 0),
        }
      }
      // prowlarr
      const client = new ProwlarrClient(row.url, row.api_key)
      const indexers = await client.getIndexers()
      const now = new Date()
      const yesterday = new Date(now)
      yesterday.setDate(yesterday.getDate() - 1)
      let grabCount = 0
      try {
        const stats = await client.getIndexerStats(yesterday.toISOString(), now.toISOString())
        grabCount = stats.reduce((a, s) => a + s.numberOfGrabs, 0)
      } catch { /* indexerstats optional */ }
      return {
        type: 'prowlarr',
        indexerCount: indexers.length,
        enabledIndexers: indexers.filter(i => i.enable).length,
        grabCount24h: grabCount,
      }
    } catch (e: any) {
      return reply.status(502).send({ error: 'Upstream error', detail: e.message })
    }
  })

  // GET /api/arr/:id/queue
  app.get<{ Params: { id: string } }>('/api/arr/:id/queue', async (req, reply) => {
    const row = await resolveInstance(req, reply, req.params.id)
    if (!row) return
    if (row.type === 'prowlarr') return reply.status(400).send({ error: 'Prowlarr has no queue' })
    try {
      if (row.type === 'sabnzbd') {
        const { queue } = await new SabnzbdClient(row.url, row.api_key).getQueue(0, 20)
        return queue
      }
      const client = row.type === 'radarr'
        ? new RadarrClient(row.url, row.api_key)
        : new SonarrClient(row.url, row.api_key)
      return await client.getQueue()
    } catch (e: any) {
      return reply.status(502).send({ error: 'Upstream error', detail: e.message })
    }
  })

  // GET /api/arr/:id/history (SABnzbd only)
  app.get<{ Params: { id: string } }>('/api/arr/:id/history', async (req, reply) => {
    const row = await resolveInstance(req, reply, req.params.id)
    if (!row) return
    if (row.type !== 'sabnzbd') return reply.status(400).send({ error: 'Only available for SABnzbd' })
    try {
      const { history } = await new SabnzbdClient(row.url, row.api_key).getHistory(0, 10)
      return history
    } catch (e: any) {
      return reply.status(502).send({ error: 'Upstream error', detail: e.message })
    }
  })

  // GET /api/arr/:id/calendar
  app.get<{ Params: { id: string } }>('/api/arr/:id/calendar', async (req, reply) => {
    const row = await resolveInstance(req, reply, req.params.id)
    if (!row) return
    if (row.type === 'prowlarr' || row.type === 'sabnzbd') return reply.status(400).send({ error: 'Not supported for this instance type' })
    try {
      const { start, end } = calendarRange()
      const client = row.type === 'radarr'
        ? new RadarrClient(row.url, row.api_key)
        : new SonarrClient(row.url, row.api_key)
      return await client.getCalendar(start, end)
    } catch (e: any) {
      return reply.status(502).send({ error: 'Upstream error', detail: e.message })
    }
  })

  // GET /api/arr/:id/indexers (Prowlarr only)
  app.get<{ Params: { id: string } }>('/api/arr/:id/indexers', async (req, reply) => {
    const row = await resolveInstance(req, reply, req.params.id)
    if (!row) return
    if (row.type !== 'prowlarr') return reply.status(400).send({ error: 'Only available for Prowlarr' })
    try {
      return await new ProwlarrClient(row.url, row.api_key).getIndexers()
    } catch (e: any) {
      return reply.status(502).send({ error: 'Upstream error', detail: e.message })
    }
  })
}
