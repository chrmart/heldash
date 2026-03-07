import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { nanoid } from 'nanoid'
import { getDb } from '../db/database'
import { callerGroupId as _callerGroupId, isValidHttpUrl } from './_helpers'
import { RadarrClient } from '../arr/radarr'
import { SonarrClient } from '../arr/sonarr'
import { ProwlarrClient } from '../arr/prowlarr'
import { SabnzbdClient } from '../arr/sabnzbd'
import { SeerrClient } from '../arr/seerr'
import type { SeerrDiscoverResponse } from '../arr/seerr'

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

function calendarRange() {
  const start = new Date()
  start.setDate(start.getDate() - 7)
  const end = new Date()
  end.setDate(end.getDate() + 60)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

export async function arrRoutes(app: FastifyInstance) {
  const db = getDb()

  function isVisibleToGroup(instanceId: string, groupId: string | null): boolean {
    if (groupId === null || groupId === 'grp_admin') return true
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
    const groupId = await _callerGroupId(req)
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
    const groupId = await _callerGroupId(req)
    const all = db.prepare(
      'SELECT * FROM arr_instances ORDER BY position, type, name'
    ).all() as ArrInstanceRow[]

    if (groupId === null) return all.map(sanitize)  // admin sees all

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
      if (!['radarr', 'sonarr', 'prowlarr', 'sabnzbd', 'seerr'].includes(type)) {
        return reply.status(400).send({ error: 'type must be radarr, sonarr, prowlarr, sabnzbd or seerr' })
      }
      if (!name?.trim() || !url?.trim() || !api_key?.trim()) {
        return reply.status(400).send({ error: 'name, url and api_key are required' })
      }
      if (!isValidHttpUrl(url.trim())) {
        return reply.status(400).send({ error: 'url must be a valid http or https URL' })
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
      if (url !== undefined) {
        if (!isValidHttpUrl(url.trim())) return reply.status(400).send({ error: 'url must be a valid http or https URL' })
        updates.push('url = ?'); values.push(url.trim().replace(/\/$/, ''))
      }
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
      if (row.type === 'seerr') {
        const status = await new SeerrClient(row.url, row.api_key).getStatus()
        return { online: true, type: 'seerr', version: status.version }
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
      if (row.type === 'seerr') {
        const count = await new SeerrClient(row.url, row.api_key).getRequestCount()
        return {
          type: 'seerr',
          pending: count.pending,
          approved: count.approved,
          declined: count.declined,
          total: count.total,
        }
      }
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
    if (row.type === 'prowlarr' || row.type === 'seerr') return reply.status(400).send({ error: 'Not available for this instance type' })
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
    if (row.type !== 'sabnzbd') return reply.status(400).send({ error: 'Only available for SABnzbd instances' })
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
    if (row.type === 'prowlarr' || row.type === 'sabnzbd' || row.type === 'seerr') return reply.status(400).send({ error: 'Not supported for this instance type' })
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

  // GET /api/arr/:id/movies (Radarr only)
  app.get<{ Params: { id: string } }>('/api/arr/:id/movies', async (req, reply) => {
    const row = await resolveInstance(req, reply, req.params.id)
    if (!row) return
    if (row.type !== 'radarr') return reply.status(400).send({ error: 'Only available for Radarr' })
    try {
      return await new RadarrClient(row.url, row.api_key).getMovies()
    } catch (e: any) {
      return reply.status(502).send({ error: 'Upstream error', detail: e.message })
    }
  })

  // GET /api/arr/:id/series (Sonarr only)
  app.get<{ Params: { id: string } }>('/api/arr/:id/series', async (req, reply) => {
    const row = await resolveInstance(req, reply, req.params.id)
    if (!row) return
    if (row.type !== 'sonarr') return reply.status(400).send({ error: 'Only available for Sonarr' })
    try {
      return await new SonarrClient(row.url, row.api_key).getSeries()
    } catch (e: any) {
      return reply.status(502).send({ error: 'Upstream error', detail: e.message })
    }
  })

  // ── Seerr routes ────────────────────────────────────────────────────────────

  // GET /api/arr/:id/requests?page=1&filter=pending
  app.get<{ Params: { id: string }; Querystring: { page?: string; filter?: string } }>(
    '/api/arr/:id/requests',
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'seerr') return reply.status(400).send({ error: 'Only available for Seerr' })
      try {
        const page = Math.max(1, parseInt(req.query.page ?? '1', 10))
        const filter = req.query.filter
        const client = new SeerrClient(row.url, row.api_key)

        // 'declined' is not a valid API filter in Overseerr/Seerr — fetch all and filter server-side
        const apiFilter = filter === 'declined' ? undefined : filter
        const response = await client.getRequests(page, apiFilter)

        let results = response.results
        if (filter === 'declined') {
          results = results.filter(r => r.status === 3)
        }

        // Enrich with titles via movie/tv endpoints (parallel, each independently)
        const seen = new Set<string>()
        const titleMap: Record<string, string> = {}
        await Promise.allSettled(
          results
            .filter(r => {
              if (!r.media) return false
              const key = `${r.media.mediaType}:${r.media.tmdbId}`
              if (seen.has(key)) return false
              seen.add(key)
              return true
            })
            .map(async r => {
              const key = `${r.media.mediaType}:${r.media.tmdbId}`
              try {
                if (r.media.mediaType === 'movie') {
                  const data = await client.getMovieDetails(r.media.tmdbId)
                  titleMap[key] = data.title
                } else {
                  const data = await client.getTvDetails(r.media.tmdbId)
                  titleMap[key] = data.name
                }
              } catch { /* title enrichment optional — falls back to tmdbId in frontend */ }
            })
        )

        return {
          ...response,
          results: results.map(r => ({
            ...r,
            media: { ...r.media, title: titleMap[`${r.media.mediaType}:${r.media.tmdbId}`] },
          })),
        }
      } catch (e: any) {
        return reply.status(502).send({ error: 'Upstream error', detail: e.message })
      }
    }
  )

  // POST /api/arr/:id/requests/:requestId/approve
  app.post<{ Params: { id: string; requestId: string } }>(
    '/api/arr/:id/requests/:requestId/approve',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'seerr') return reply.status(400).send({ error: 'Only available for Seerr' })
      try {
        return await new SeerrClient(row.url, row.api_key).approveRequest(parseInt(req.params.requestId, 10))
      } catch (e: any) {
        return reply.status(502).send({ error: 'Upstream error', detail: e.message })
      }
    }
  )

  // POST /api/arr/:id/requests/:requestId/decline
  app.post<{ Params: { id: string; requestId: string } }>(
    '/api/arr/:id/requests/:requestId/decline',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'seerr') return reply.status(400).send({ error: 'Only available for Seerr' })
      try {
        return await new SeerrClient(row.url, row.api_key).declineRequest(parseInt(req.params.requestId, 10))
      } catch (e: any) {
        return reply.status(502).send({ error: 'Upstream error', detail: e.message })
      }
    }
  )

  // DELETE /api/arr/:id/requests/:requestId
  app.delete<{ Params: { id: string; requestId: string } }>(
    '/api/arr/:id/requests/:requestId',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'seerr') return reply.status(400).send({ error: 'Only available for Seerr' })
      try {
        await new SeerrClient(row.url, row.api_key).deleteRequest(parseInt(req.params.requestId, 10))
        return reply.status(204).send()
      } catch (e: any) {
        return reply.status(502).send({ error: 'Upstream error', detail: e.message })
      }
    }
  )

  // GET /api/arr/:id/discover/movies?page=1&sortBy=popularity.desc
  app.get<{ Params: { id: string }; Querystring: { page?: string; sortBy?: string } }>(
    '/api/arr/:id/discover/movies',
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'seerr') return reply.status(400).send({ error: 'Only available for Seerr' })
      try {
        const page = Math.max(1, parseInt(req.query.page ?? '1', 10))
        const sortBy = req.query.sortBy ?? 'popularity.desc'
        return await new SeerrClient(row.url, row.api_key).getDiscoverMovies(page, sortBy)
      } catch (e: any) {
        return reply.status(502).send({ error: 'Upstream error', detail: e.message })
      }
    }
  )

  // GET /api/arr/:id/discover/tv?page=1&sortBy=popularity.desc
  app.get<{ Params: { id: string }; Querystring: { page?: string; sortBy?: string } }>(
    '/api/arr/:id/discover/tv',
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'seerr') return reply.status(400).send({ error: 'Only available for Seerr' })
      try {
        const page = Math.max(1, parseInt(req.query.page ?? '1', 10))
        const sortBy = req.query.sortBy ?? 'popularity.desc'
        return await new SeerrClient(row.url, row.api_key).getDiscoverTv(page, sortBy)
      } catch (e: any) {
        return reply.status(502).send({ error: 'Upstream error', detail: e.message })
      }
    }
  )

  // GET /api/arr/:id/discover/trending
  app.get<{ Params: { id: string } }>(
    '/api/arr/:id/discover/trending',
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'seerr') return reply.status(400).send({ error: 'Only available for Seerr' })
      try {
        return await new SeerrClient(row.url, row.api_key).getTrending()
      } catch (e: any) {
        return reply.status(502).send({ error: 'Upstream error', detail: e.message })
      }
    }
  )

  // GET /api/arr/:id/discover/search?query=<search-term>
  app.get<{ Params: { id: string }; Querystring: { query: string } }>(
    '/api/arr/:id/discover/search',
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'seerr') return reply.status(400).send({ error: 'Only available for Seerr' })
      if (!req.query.query?.trim()) return reply.status(400).send({ error: 'Query required' })
      try {
        return await new SeerrClient(row.url, row.api_key).search(req.query.query)
      } catch (e: any) {
        return reply.status(502).send({ error: 'Upstream error', detail: e.message })
      }
    }
  )

  // POST /api/arr/:id/discover/request
  app.post<{ Params: { id: string }; Body: { mediaType: 'movie' | 'tv'; tmdbId: number; seasons?: number[] } }>(
    '/api/arr/:id/discover/request',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const row = await resolveInstance(req, reply, req.params.id)
      if (!row) return
      if (row.type !== 'seerr') return reply.status(400).send({ error: 'Only available for Seerr' })
      try {
        const result = await new SeerrClient(row.url, row.api_key).requestMedia(req.body.mediaType, req.body.tmdbId, req.body.seasons)
        return result
      } catch (e: any) {
        return reply.status(502).send({ error: 'Upstream error', detail: e.message })
      }
    }
  )
}
