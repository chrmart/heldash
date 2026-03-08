import { FastifyInstance } from 'fastify'
import { nanoid } from 'nanoid'
import { getDb } from '../db/database'
import { RadarrClient } from '../arr/radarr'
import { SonarrClient } from '../arr/sonarr'
import { fetchLatestCommit, fetchChangedFiles } from '../trash/github-fetcher'
import {
  parseCustomFormats, parseQualityProfiles, persistToCache,
  loadCachedFormats, loadCachedProfiles,
} from '../trash/trash-parser'
import { computeChangeset } from '../trash/merge-engine'
import { executeSyncChangeset } from '../trash/sync-executor'
import { scanForRepairs, markDailyRepairRun } from '../trash/repair-engine'
import {
  resolveArrId, invalidateCache as invalidateResolverCache,
} from '../trash/format-id-resolver'
import {
  isActivelySyncing, acquireSync, releaseSync,
  registerSyncFn, rescheduleInstance,
} from '../trash/scheduler'
import type {
  TrashInstanceConfig, TrashUserOverride, TrashDeprecatedFormat,
  TrashSyncLog, ArrSnapshot, SyncTrigger, TrashWidgetStats,
} from '../trash/types'

// ── DB row types ──────────────────────────────────────────────────────────────

interface ArrInstanceRow {
  id: string; type: string; name: string; url: string; api_key: string; enabled: number
}

// ── Client factory ────────────────────────────────────────────────────────────

function makeTrashClient(row: ArrInstanceRow): RadarrClient | SonarrClient {
  if (row.type === 'radarr') return new RadarrClient(row.url, row.api_key)
  if (row.type === 'sonarr') return new SonarrClient(row.url, row.api_key)
  throw new Error(`Unsupported arr type for TRaSH sync: ${row.type}`)
}

// ── Load live arr snapshot (pre-merge, rate-limited) ─────────────────────────

async function loadArrSnapshot(client: RadarrClient | SonarrClient): Promise<ArrSnapshot> {
  const [formats, profiles] = await Promise.all([
    client.getCustomFormats(),
    client.getQualityProfiles(),
  ])
  const byId = new Map(formats.map(f => [f.id, f]))
  const profileById = new Map(profiles.map(p => [p.id, p]))
  return { formats, byId, profiles, profileById }
}

// ── Core sync orchestration (used by routes + scheduler) ─────────────────────

async function runSync(
  instanceId: string,
  trigger: SyncTrigger,
  app: FastifyInstance,
): Promise<void> {
  const db = getDb()
  const cfg = db.prepare(
    'SELECT * FROM trash_instance_configs WHERE instance_id = ?'
  ).get(instanceId) as TrashInstanceConfig | undefined
  if (!cfg) throw new Error(`No trash config for instance ${instanceId}`)

  const arrRow = db.prepare(
    'SELECT * FROM arr_instances WHERE id = ? AND enabled = 1'
  ).get(instanceId) as ArrInstanceRow | undefined
  if (!arrRow) throw new Error(`Arr instance ${instanceId} not found or disabled`)

  const client = makeTrashClient(arrRow)
  const arrType = arrRow.type as 'radarr' | 'sonarr'

  app.log.info({ instanceId, trigger }, 'trash: sync started')

  // 1. Fetch changed files from GitHub
  let commitInfo
  try {
    commitInfo = await fetchLatestCommit()
  } catch (err: unknown) {
    app.log.warn({ instanceId, err }, 'trash: GitHub fetch failed — using cached data')
    commitInfo = null
  }

  let githubCommitDate: string | null = null

  if (commitInfo) {
    githubCommitDate = commitInfo.commitDate
    // Check if cache is already current
    const cacheRow = db.prepare(
      `SELECT github_sha FROM trash_guides_cache WHERE arr_type = ? LIMIT 1`
    ).get(arrType) as { github_sha: string } | undefined

    if (cacheRow?.github_sha !== commitInfo.sha) {
      const changed = await fetchChangedFiles(commitInfo)
      if (changed.length > 0) {
        const { formats, trashIdToSlug } = parseCustomFormats(changed, commitInfo.sha, commitInfo.commitDate)
        const profiles = parseQualityProfiles(changed, trashIdToSlug, commitInfo.sha, commitInfo.commitDate)
        persistToCache(formats, profiles, arrType)
        app.log.info({ instanceId, formatsUpdated: formats.length, profilesUpdated: profiles.length }, 'trash: cache updated')
      }
    }
  }

  // 2. Load normalized data from cache
  const upstream = loadCachedFormats(arrType)
  const cachedProfiles = loadCachedProfiles(arrType)
  const selectedProfile = cfg.profile_slug
    ? (cachedProfiles.find(p => p.slug === cfg.profile_slug) ?? null)
    : null

  // 3. Load live arr snapshot (one shot, before merge)
  let snapshot: ArrSnapshot
  try {
    snapshot = await loadArrSnapshot(client)
  } catch (err: unknown) {
    app.log.warn({ instanceId, err }, 'trash: failed to load arr snapshot')
    throw err
  }

  // 4. Load user overrides and deprecated set
  const overrides = db.prepare(
    'SELECT * FROM trash_user_overrides WHERE instance_id = ?'
  ).all(instanceId) as TrashUserOverride[]
  const deprecatedRows = db.prepare(
    'SELECT slug FROM trash_deprecated_formats WHERE instance_id = ?'
  ).all(instanceId) as { slug: string }[]
  const deprecatedSlugs = new Set(deprecatedRows.map(r => r.slug))

  // 5. Compute changeset (pure — no external calls)
  let changeset = computeChangeset(instanceId, upstream, selectedProfile, snapshot, overrides, deprecatedSlugs)

  // For repair_daily, inject repair scan results
  if (trigger === 'repair_daily') {
    const { repairs } = scanForRepairs(instanceId, snapshot, upstream, overrides)
    changeset = { ...changeset, repair: [...changeset.repair, ...repairs] }
    markDailyRepairRun(instanceId)
  }

  // 6. In notify mode: store preview, don't apply
  if (cfg.sync_mode === 'notify' && trigger !== 'user_confirm' && trigger !== 'repair_daily') {
    if (!changeset.isNoOp) {
      const previewId = nanoid()
      const expiresAt = new Date(Date.now() + 24 * 3_600_000).toISOString()
      db.prepare(`
        INSERT OR REPLACE INTO trash_pending_previews
          (id, instance_id, diff, preview_base_sha, is_stale, created_at, expires_at)
        VALUES (?, ?, ?, ?, 0, datetime('now'), ?)
      `).run(previewId, instanceId, JSON.stringify(changeset), commitInfo?.sha ?? '', expiresAt)
      app.log.info({ instanceId, previewId, changes: changeset.add.length + changeset.updateConditions.length }, 'trash: preview stored')
    }
    return
  }

  // 7. Execute changeset
  const report = await executeSyncChangeset(changeset, client, trigger, githubCommitDate)

  app.log.info({
    instanceId, trigger, status: report.status, durationMs: report.durationMs,
    formatsCreated: report.formatsCreated, conditionsUpdated: report.conditionsUpdated,
    errors: report.errors.length,
  }, 'trash: sync complete')
}

// ── Register sync function with scheduler ─────────────────────────────────────
// Done lazily inside the route plugin so `app` is available for logging.

// ── Routes ────────────────────────────────────────────────────────────────────

export async function trashRoutes(app: FastifyInstance) {
  const db = getDb()

  // Register sync fn with scheduler (gives scheduler access to app logger)
  registerSyncFn(async (instanceId, trigger) => {
    await runSync(instanceId, trigger, app)
  }, app.log)

  // ── GET /api/trash/instances — list configured instances ──────────────────

  app.get('/api/trash/instances', { preHandler: [app.authenticate] }, async () => {
    const configs = db.prepare('SELECT * FROM trash_instance_configs ORDER BY created_at').all() as TrashInstanceConfig[]
    return configs.map(c => ({
      ...c,
      enabled: c.enabled === 1,
      isSyncing: isActivelySyncing(c.instance_id),
    }))
  })

  // ── POST /api/trash/instances/:id/configure — set sync config ─────────────

  interface ConfigureBody {
    profile_slug?: string | null
    sync_mode?: 'auto' | 'manual' | 'notify'
    sync_interval_hours?: number
    enabled?: boolean
  }

  app.post<{ Params: { id: string }; Body: ConfigureBody }>(
    '/api/trash/instances/:id/configure',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const arrRow = db.prepare(
        'SELECT * FROM arr_instances WHERE id = ? AND (type = ? OR type = ?)'
      ).get(req.params.id, 'radarr', 'sonarr') as ArrInstanceRow | undefined
      if (!arrRow) return reply.status(404).send({ error: 'Arr instance not found or unsupported type' })

      const existing = db.prepare(
        'SELECT * FROM trash_instance_configs WHERE instance_id = ?'
      ).get(req.params.id) as TrashInstanceConfig | undefined

      const { profile_slug, sync_mode, sync_interval_hours, enabled } = req.body

      if (existing) {
        db.prepare(`
          UPDATE trash_instance_configs
          SET profile_slug = COALESCE(?, profile_slug),
              sync_mode    = COALESCE(?, sync_mode),
              sync_interval_hours = COALESCE(?, sync_interval_hours),
              enabled      = COALESCE(?, enabled),
              updated_at   = datetime('now')
          WHERE instance_id = ?
        `).run(
          profile_slug !== undefined ? profile_slug : null,
          sync_mode ?? null,
          sync_interval_hours ?? null,
          enabled !== undefined ? (enabled ? 1 : 0) : null,
          req.params.id,
        )
      } else {
        db.prepare(`
          INSERT INTO trash_instance_configs
            (id, instance_id, arr_type, profile_slug, sync_mode, sync_interval_hours, enabled)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          nanoid(), req.params.id, arrRow.type,
          profile_slug ?? null,
          sync_mode ?? 'notify',
          sync_interval_hours ?? 24,
          enabled !== undefined ? (enabled ? 1 : 0) : 1,
        )
      }

      rescheduleInstance(req.params.id)
      return { ok: true }
    },
  )

  // ── GET /api/trash/instances/:id/profiles — available TRaSH profiles ───────

  app.get<{ Params: { id: string } }>(
    '/api/trash/instances/:id/profiles',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const cfg = db.prepare(
        'SELECT arr_type FROM trash_instance_configs WHERE instance_id = ?'
      ).get(req.params.id) as { arr_type: string } | undefined
      if (!cfg) return reply.status(404).send({ error: 'Not configured' })
      const profiles = loadCachedProfiles(cfg.arr_type as 'radarr' | 'sonarr')
      return profiles.map(p => ({ slug: p.slug, name: p.name, formatCount: p.formatScores.length }))
    },
  )

  // ── GET /api/trash/instances/:id/custom-formats — all formats ─────────────

  app.get<{ Params: { id: string } }>(
    '/api/trash/instances/:id/custom-formats',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const cfg = db.prepare(
        'SELECT arr_type FROM trash_instance_configs WHERE instance_id = ?'
      ).get(req.params.id) as { arr_type: string } | undefined
      if (!cfg) return reply.status(404).send({ error: 'Not configured' })

      const formats = loadCachedFormats(cfg.arr_type as 'radarr' | 'sonarr')
      const overrides = db.prepare(
        'SELECT * FROM trash_user_overrides WHERE instance_id = ?'
      ).all(req.params.id) as TrashUserOverride[]
      const overrideMap = new Map(overrides.map(o => [o.slug, o]))
      const deprecated = db.prepare(
        'SELECT slug FROM trash_deprecated_formats WHERE instance_id = ?'
      ).all(req.params.id) as { slug: string }[]
      const deprecatedSet = new Set(deprecated.map(r => r.slug))

      return formats.map(f => {
        const override = overrideMap.get(f.slug)
        return {
          slug: f.slug,
          name: f.name,
          recommendedScore: f.recommendedScore,
          score: override?.score ?? f.recommendedScore,
          enabled: override ? override.enabled === 1 : true,
          deprecated: deprecatedSet.has(f.slug),
          arrFormatId: resolveArrId(req.params.id, f.slug),
        }
      })
    },
  )

  // ── GET /api/trash/instances/:id/overrides ─────────────────────────────────

  app.get<{ Params: { id: string } }>(
    '/api/trash/instances/:id/overrides',
    { preHandler: [app.authenticate] },
    async (req) => {
      return db.prepare(
        'SELECT * FROM trash_user_overrides WHERE instance_id = ?'
      ).all(req.params.id) as TrashUserOverride[]
    },
  )

  // ── PUT /api/trash/instances/:id/overrides — bulk upsert ──────────────────

  interface OverrideItem { slug: string; score?: number | null; enabled?: boolean }
  interface OverridesBody { overrides: OverrideItem[] }

  app.put<{ Params: { id: string }; Body: OverridesBody }>(
    '/api/trash/instances/:id/overrides',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { overrides } = req.body
      if (!Array.isArray(overrides)) return reply.status(400).send({ error: 'overrides must be array' })
      const upsert = db.prepare(`
        INSERT INTO trash_user_overrides (id, instance_id, slug, score, enabled, updated_at)
        VALUES (COALESCE((SELECT id FROM trash_user_overrides WHERE instance_id=? AND slug=?), ?), ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(instance_id, slug) DO UPDATE SET score=excluded.score, enabled=excluded.enabled, updated_at=excluded.updated_at
      `)
      db.transaction((items: OverrideItem[]) => {
        for (const item of items) {
          upsert.run(
            req.params.id, item.slug, nanoid(),
            req.params.id, item.slug,
            item.score !== undefined ? item.score : null,
            item.enabled !== false ? 1 : 0,
          )
        }
      })(overrides)
      return { ok: true, updated: overrides.length }
    },
  )

  // ── POST /api/trash/instances/:id/sync — manual sync trigger ──────────────

  app.post<{ Params: { id: string } }>(
    '/api/trash/instances/:id/sync',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      if (isActivelySyncing(req.params.id)) {
        return reply.status(409).send({ error: 'Sync already in progress' })
      }
      if (!acquireSync(req.params.id)) {
        return reply.status(409).send({ error: 'Sync already in progress' })
      }
      // Run async — don't await so the HTTP response returns immediately
      runSync(req.params.id, 'manual', app)
        .catch(err => app.log.warn({ instanceId: req.params.id, err }, 'trash: manual sync failed'))
        .finally(() => releaseSync(req.params.id))
      return { ok: true, message: 'Sync started' }
    },
  )

  // ── GET /api/trash/instances/:id/preview — get pending preview ────────────

  app.get<{ Params: { id: string } }>(
    '/api/trash/instances/:id/preview',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const row = db.prepare(
        `SELECT * FROM trash_pending_previews WHERE instance_id = ? AND expires_at > datetime('now') ORDER BY created_at DESC LIMIT 1`
      ).get(req.params.id) as { id: string; diff: string; preview_base_sha: string; created_at: string; expires_at: string; is_stale: number } | undefined
      if (!row) return reply.status(404).send({ error: 'No pending preview' })

      // Check staleness against current cache SHA
      const cacheRow = db.prepare(
        `SELECT github_sha FROM trash_guides_cache WHERE arr_type = (SELECT arr_type FROM trash_instance_configs WHERE instance_id = ?) LIMIT 1`
      ).get(req.params.id) as { github_sha: string } | undefined

      const isStale = cacheRow && row.preview_base_sha !== cacheRow.github_sha
      if (isStale) {
        db.prepare('UPDATE trash_pending_previews SET is_stale = 1 WHERE id = ?').run(row.id)
      }

      const changeset = JSON.parse(row.diff)
      return {
        id: row.id,
        instanceId: req.params.id,
        previewBaseSha: row.preview_base_sha,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        stale: !!isStale,
        summary: {
          formatsAdded: changeset.add?.length ?? 0,
          conditionsUpdated: changeset.updateConditions?.length ?? 0,
          profilesUpdated: changeset.updateProfiles?.length ?? 0,
          formatsDeprecated: changeset.deprecate?.length ?? 0,
          repairItems: changeset.repair?.length ?? 0,
        },
        changes: [
          ...(changeset.add ?? []).map((c: { format: { slug: string; name: string }; score: number }) => ({ type: 'add', slug: c.format.slug, name: c.format.name, detail: `Score: ${c.score}` })),
          ...(changeset.updateConditions ?? []).map((c: { slug: string }) => ({ type: 'update_conditions', slug: c.slug, name: c.slug, detail: 'Conditions updated upstream' })),
          ...(changeset.deprecate ?? []).map((c: { slug: string; name: string }) => ({ type: 'deprecate', slug: c.slug, name: c.name, detail: 'Removed from TRaSH Guides — score set to 0' })),
        ],
      }
    },
  )

  // ── POST /api/trash/instances/:id/apply/:pid — apply a preview ────────────

  app.post<{ Params: { id: string; pid: string } }>(
    '/api/trash/instances/:id/apply/:pid',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const row = db.prepare(
        `SELECT * FROM trash_pending_previews WHERE id = ? AND instance_id = ? AND expires_at > datetime('now')`
      ).get(req.params.pid, req.params.id) as { diff: string; preview_base_sha: string; is_stale: number } | undefined
      if (!row) return reply.status(404).send({ error: 'Preview not found or expired' })
      if (row.is_stale) return reply.status(409).send({ error: 'Preview is stale — upstream changed. Re-sync first.' })
      if (isActivelySyncing(req.params.id)) return reply.status(409).send({ error: 'Sync already in progress' })

      if (!acquireSync(req.params.id)) return reply.status(409).send({ error: 'Sync already in progress' })
      runSync(req.params.id, 'user_confirm', app)
        .catch(err => app.log.warn({ instanceId: req.params.id, err }, 'trash: apply failed'))
        .finally(() => {
          releaseSync(req.params.id)
          db.prepare('DELETE FROM trash_pending_previews WHERE id = ?').run(req.params.pid)
        })
      return { ok: true, message: 'Applying changes' }
    },
  )

  // ── GET /api/trash/instances/:id/log — sync history ──────────────────────

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/api/trash/instances/:id/log',
    { preHandler: [app.authenticate] },
    async (req) => {
      const limit = Math.min(parseInt(req.query.limit ?? '50', 10), 200)
      return db.prepare(
        'SELECT * FROM trash_sync_log WHERE instance_id = ? ORDER BY started_at DESC LIMIT ?'
      ).all(req.params.id, limit) as TrashSyncLog[]
    },
  )

  // ── GET /api/trash/instances/:id/deprecated — deprecated formats ──────────

  app.get<{ Params: { id: string } }>(
    '/api/trash/instances/:id/deprecated',
    { preHandler: [app.authenticate] },
    async (req) => {
      return db.prepare(
        'SELECT * FROM trash_deprecated_formats WHERE instance_id = ? ORDER BY deprecated_at DESC'
      ).all(req.params.id) as TrashDeprecatedFormat[]
    },
  )

  // ── DELETE /api/trash/instances/:id/deprecated/:slug — user-triggered hard delete ──

  app.delete<{ Params: { id: string; slug: string } }>(
    '/api/trash/instances/:id/deprecated/:slug',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const row = db.prepare(
        'SELECT * FROM trash_deprecated_formats WHERE instance_id = ? AND slug = ?'
      ).get(req.params.id, req.params.slug) as TrashDeprecatedFormat | undefined
      if (!row) return reply.status(404).send({ error: 'Not found' })

      if (row.arr_format_id !== null) {
        const arrRow = db.prepare('SELECT * FROM arr_instances WHERE id = ?').get(req.params.id) as ArrInstanceRow | undefined
        if (arrRow) {
          try {
            const client = makeTrashClient(arrRow)
            await client.deleteCustomFormat(row.arr_format_id)
          } catch (err: unknown) {
            app.log.warn({ slug: req.params.slug, err }, 'trash: delete from arr failed')
          }
        }
      }

      db.prepare('DELETE FROM trash_deprecated_formats WHERE instance_id = ? AND slug = ?').run(req.params.id, req.params.slug)
      db.prepare('DELETE FROM trash_format_instances WHERE instance_id = ? AND slug = ?').run(req.params.id, req.params.slug)
      invalidateResolverCache(req.params.id)
      return reply.status(204).send()
    },
  )

  // ── GET /api/trash/instances/:id/import-formats — live formats from arr ───

  app.get<{ Params: { id: string } }>(
    '/api/trash/instances/:id/import-formats',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const arrRow = db.prepare('SELECT * FROM arr_instances WHERE id = ?').get(req.params.id) as ArrInstanceRow | undefined
      if (!arrRow) return reply.status(404).send({ error: 'Not found' })
      try {
        const client = makeTrashClient(arrRow)
        const formats = await client.getCustomFormats()
        return formats.map(f => ({ id: f.id, name: f.name, specsCount: f.specifications.length }))
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Connection failed'
        return reply.status(502).send({ error: msg })
      }
    },
  )

  // ── POST /api/trash/instances/:id/import-formats — import selected formats ─

  interface ImportFormatsBody { format_ids: number[] }

  app.post<{ Params: { id: string }; Body: ImportFormatsBody }>(
    '/api/trash/instances/:id/import-formats',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const { format_ids } = req.body
      if (!Array.isArray(format_ids) || format_ids.length === 0) {
        return reply.status(400).send({ error: 'format_ids must be non-empty array' })
      }
      const arrRow = db.prepare('SELECT * FROM arr_instances WHERE id = ?').get(req.params.id) as ArrInstanceRow | undefined
      if (!arrRow) return reply.status(404).send({ error: 'Not found' })

      const client = makeTrashClient(arrRow)
      const { toSlug } = await import('../trash/trash-parser')
      let imported = 0
      for (const id of format_ids) {
        try {
          const fmt = await client.getCustomFormat(id)
          const slug = toSlug(fmt.name)
          db.prepare(`
            INSERT OR IGNORE INTO trash_custom_formats
              (id, instance_id, source, arr_format_id, name, slug, score, specifications, enabled)
            VALUES (?, ?, 'imported', ?, ?, ?, 0, ?, 1)
          `).run(nanoid(), req.params.id, fmt.id, fmt.name, slug, JSON.stringify(fmt.specifications))
          imported++
        } catch { /* skip individual failures */ }
      }
      return { ok: true, imported }
    },
  )

  // ── GET /api/trash/sync-status — widget stats (silent polling) ────────────

  app.get('/api/trash/sync-status', { logLevel: 'silent', preHandler: [app.authenticate] }, async () => {
    const configs = db.prepare('SELECT * FROM trash_instance_configs WHERE enabled = 1').all() as TrashInstanceConfig[]
    const instances: TrashWidgetStats['instances'] = []

    for (const cfg of configs) {
      const arrRow = db.prepare('SELECT name FROM arr_instances WHERE id = ?').get(cfg.instance_id) as { name: string } | undefined
      const lastLog = db.prepare(
        `SELECT status FROM trash_sync_log WHERE instance_id = ? ORDER BY started_at DESC LIMIT 1`
      ).get(cfg.instance_id) as { status: string } | undefined
      const pendingPreview = db.prepare(
        `SELECT 1 FROM trash_pending_previews WHERE instance_id = ? AND expires_at > datetime('now') AND is_stale = 0 LIMIT 1`
      ).get(cfg.instance_id)
      const activeFmts = db.prepare(
        'SELECT COUNT(*) as cnt FROM trash_format_instances WHERE instance_id = ?'
      ).get(cfg.instance_id) as { cnt: number }
      const deprecatedFmts = db.prepare(
        'SELECT COUNT(*) as cnt FROM trash_deprecated_formats WHERE instance_id = ?'
      ).get(cfg.instance_id) as { cnt: number }

      instances.push({
        instanceId: cfg.instance_id,
        instanceName: arrRow?.name ?? cfg.instance_id,
        arrType: cfg.arr_type as 'radarr' | 'sonarr',
        profileSlug: cfg.profile_slug,
        syncMode: cfg.sync_mode,
        lastSyncAt: cfg.last_sync_at,
        lastSyncStatus: (lastLog?.status ?? null) as TrashWidgetStats['instances'][number]['lastSyncStatus'],
        pendingReview: !!pendingPreview,
        formatsActive: activeFmts.cnt,
        formatsDeprecated: deprecatedFmts.cnt,
        isCurrentlySyncing: isActivelySyncing(cfg.instance_id),
      })
    }

    const result: TrashWidgetStats = { type: 'trash_guides', instances }
    return result
  })

  // ── POST /api/trash/github/fetch — force re-fetch GitHub cache ────────────

  app.post('/api/trash/github/fetch', { preHandler: [app.requireAdmin] }, async (_, reply) => {
    try {
      const commitInfo = await fetchLatestCommit()
      // Force re-fetch all files by clearing the file index
      const db = getDb()
      db.prepare('DELETE FROM trash_guides_file_index').run()
      const changed = await fetchChangedFiles(commitInfo)
      let totalFormats = 0
      for (const arrType of ['radarr', 'sonarr'] as const) {
        const typeFiles = changed.filter(f => f.arrType === arrType)
        if (typeFiles.length === 0) continue
        const { formats, trashIdToSlug } = parseCustomFormats(typeFiles, commitInfo.sha, commitInfo.commitDate)
        const profiles = parseQualityProfiles(typeFiles, trashIdToSlug, commitInfo.sha, commitInfo.commitDate)
        persistToCache(formats, profiles, arrType)
        totalFormats += formats.length
      }
      return { ok: true, sha: commitInfo.sha, filesUpdated: changed.length, formatsUpdated: totalFormats }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Fetch failed'
      return reply.status(502).send({ error: msg })
    }
  })
}
