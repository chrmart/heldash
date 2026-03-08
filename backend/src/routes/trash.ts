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
import { safeJson } from '../db/database'
import type {
  TrashInstanceConfig, TrashProfileConfig, TrashUserOverride,
  TrashDeprecatedFormat, TrashSyncLog, ArrSnapshot, SyncTrigger,
  TrashWidgetStats, NormalizedCustomFormat, NormalizedQualityProfile,
  GithubCommitInfo, UserCustomFormatForSync, FormatSpecification,
} from '../trash/types'

interface UserCustomFormatDbRow {
  id: string; instance_id: string; source: string; arr_format_id: number | null
  name: string; slug: string; score: number; specifications: string
  enabled: number; profile_slug: string | null
  created_at: string; updated_at: string
}

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

// ── Load live arr snapshot ────────────────────────────────────────────────────

async function loadArrSnapshot(client: RadarrClient | SonarrClient): Promise<ArrSnapshot> {
  const [formats, profiles] = await Promise.all([
    client.getCustomFormats(),
    client.getQualityProfiles(),
  ])
  const byId = new Map(formats.map(f => [f.id, f]))
  const profileById = new Map(profiles.map(p => [p.id, p]))
  return { formats, byId, profiles, profileById }
}

// ── Sync a single profile config ──────────────────────────────────────────────

async function syncOneProfile(
  instanceId: string,
  profileCfg: TrashProfileConfig,
  instanceCfg: TrashInstanceConfig,
  client: RadarrClient | SonarrClient,
  allUpstream: NormalizedCustomFormat[],
  allActiveUpstreamSlugs: Set<string>,
  cachedProfiles: NormalizedQualityProfile[],
  snapshot: ArrSnapshot,
  deprecatedSlugs: Set<string>,
  trigger: SyncTrigger,
  app: FastifyInstance,
  commitInfo: GithubCommitInfo | null,
): Promise<void> {
  const db = getDb()
  const { profile_slug } = profileCfg

  const selectedProfile = cachedProfiles.find(p => p.slug === profile_slug) ?? null
  if (!selectedProfile) {
    app.log.warn({ instanceId, profile_slug }, 'trash: profile not found in cache — skipping')
    return
  }

  // Filter upstream to formats referenced by this profile
  const profileFormatSlugs = new Set(selectedProfile.formatScores.map(fs => fs.formatSlug))
  const filteredUpstream = allUpstream.filter(f => profileFormatSlugs.has(f.slug))

  // Load profile-scoped overrides
  const overrides = db.prepare(
    'SELECT * FROM trash_user_overrides WHERE instance_id = ? AND profile_slug = ?'
  ).all(instanceId, profile_slug) as TrashUserOverride[]

  // Load user custom formats linked to this profile
  const userCustomRows = db.prepare(
    'SELECT * FROM trash_custom_formats WHERE instance_id = ? AND profile_slug = ?'
  ).all(instanceId, profile_slug) as UserCustomFormatDbRow[]

  const userCustomFormats: UserCustomFormatForSync[] = userCustomRows.map(r => ({
    slug: r.slug,
    name: r.name,
    score: r.score,
    specifications: safeJson<FormatSpecification[]>(r.specifications, []),
    arrFormatId: r.arr_format_id,
  }))

  // Compute changeset (pure — no external calls)
  let changeset = computeChangeset(
    instanceId, profile_slug, filteredUpstream, allActiveUpstreamSlugs,
    selectedProfile, snapshot, overrides, deprecatedSlugs, userCustomFormats,
  )

  // For repair_daily, inject repair scan results
  if (trigger === 'repair_daily') {
    const { repairs } = scanForRepairs(instanceId, snapshot, filteredUpstream, overrides)
    changeset = { ...changeset, repair: [...changeset.repair, ...repairs] }
    markDailyRepairRun(instanceId)
  }

  // Effective sync_mode (instance default)
  const effectiveSyncMode = instanceCfg.sync_mode

  // In notify mode: store preview, don't apply
  if (effectiveSyncMode === 'notify' && trigger !== 'user_confirm' && trigger !== 'repair_daily') {
    if (!changeset.isNoOp) {
      const previewId = nanoid()
      const expiresAt = new Date(Date.now() + 24 * 3_600_000).toISOString()
      db.prepare(`
        INSERT OR REPLACE INTO trash_pending_previews
          (id, instance_id, profile_slug, diff, preview_base_sha, is_stale, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, 0, datetime('now'), ?)
      `).run(previewId, instanceId, profile_slug, JSON.stringify(changeset), commitInfo?.sha ?? '', expiresAt)
      app.log.info({
        instanceId, profile_slug, previewId,
        changes: changeset.add.length + changeset.updateConditions.length,
      }, 'trash: preview stored')
    }
    return
  }

  // Execute changeset
  const githubCommitDate = commitInfo?.commitDate ?? null
  const report = await executeSyncChangeset(changeset, client, trigger, githubCommitDate)

  // Update profile config last_sync_at
  db.prepare(`
    UPDATE trash_profile_configs
    SET last_sync_at = ?, last_sync_sha = ?, updated_at = datetime('now')
    WHERE instance_id = ? AND profile_slug = ?
  `).run(report.endTime, report.githubSha, instanceId, profile_slug)

  app.log.info({
    instanceId, profile_slug, trigger, status: report.status,
    durationMs: report.durationMs, formatsCreated: report.formatsCreated,
    errors: report.errors.length,
  }, 'trash: profile sync complete')
}

// ── Core sync orchestration ───────────────────────────────────────────────────

async function runSync(
  instanceId: string,
  trigger: SyncTrigger,
  app: FastifyInstance,
  targetProfileSlug?: string,
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

  // Determine which profile configs to sync
  const allProfileConfigs = db.prepare(
    'SELECT * FROM trash_profile_configs WHERE instance_id = ? ORDER BY position'
  ).all(instanceId) as TrashProfileConfig[]

  let profilesToSync = allProfileConfigs.filter(p => p.enabled === 1)
  if (targetProfileSlug) {
    profilesToSync = profilesToSync.filter(p => p.profile_slug === targetProfileSlug)
  }

  if (profilesToSync.length === 0) {
    // Backward compat: if no profile_configs but instance has profile_slug, treat as single profile
    if (cfg.profile_slug && !targetProfileSlug) {
      app.log.info({ instanceId }, 'trash: no profile_configs found, using legacy profile_slug')
      profilesToSync = [{
        id: 'legacy', instance_id: instanceId, arr_type: arrType,
        profile_slug: cfg.profile_slug,
        sync_mode: cfg.sync_mode, sync_interval_hours: cfg.sync_interval_hours,
        last_sync_at: cfg.last_sync_at, last_sync_sha: cfg.last_sync_sha,
        last_repair_daily_at: cfg.last_repair_daily_at,
        enabled: 1, position: 0,
        created_at: cfg.created_at, updated_at: cfg.updated_at,
      }]
    } else {
      app.log.info({ instanceId, targetProfileSlug }, 'trash: no enabled profiles to sync')
      return
    }
  }

  app.log.info({ instanceId, trigger, profileCount: profilesToSync.length }, 'trash: sync started')

  // 1. Fetch changed files from GitHub (once for all profiles)
  let commitInfo: GithubCommitInfo | null = null
  try {
    commitInfo = await fetchLatestCommit()
  } catch (err: unknown) {
    app.log.warn({ instanceId, err }, 'trash: GitHub fetch failed — using cached data')
  }

  if (commitInfo) {
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

  // 2. Load normalized data from cache (once for all profiles)
  const allUpstream = loadCachedFormats(arrType)
  const cachedProfiles = loadCachedProfiles(arrType)

  // 3. Build the union of all active profile format slugs (for safe deprecation)
  const allActiveUpstreamSlugs = new Set<string>()
  for (const profileCfg of allProfileConfigs.filter(p => p.enabled === 1)) {
    const prof = cachedProfiles.find(p => p.slug === profileCfg.profile_slug)
    if (prof) prof.formatScores.forEach(fs => allActiveUpstreamSlugs.add(fs.formatSlug))
  }
  // User custom formats are never deprecated regardless of profile state
  const allUserCustomRows = db.prepare(
    'SELECT slug FROM trash_custom_formats WHERE instance_id = ?'
  ).all(instanceId) as { slug: string }[]
  allUserCustomRows.forEach(r => allActiveUpstreamSlugs.add(r.slug))

  // 4. Load live arr snapshot (once for all profiles)
  let snapshot: ArrSnapshot
  try {
    snapshot = await loadArrSnapshot(client)
  } catch (err: unknown) {
    app.log.warn({ instanceId, err }, 'trash: failed to load arr snapshot')
    throw err
  }

  // 5. Load deprecated slugs (instance-level)
  const deprecatedRows = db.prepare(
    'SELECT slug FROM trash_deprecated_formats WHERE instance_id = ?'
  ).all(instanceId) as { slug: string }[]
  const deprecatedSlugs = new Set(deprecatedRows.map(r => r.slug))

  // 6. Check if per-profile sync is due (for auto trigger)
  for (const profileCfg of profilesToSync) {
    if (trigger === 'auto') {
      const intervalMs = profileCfg.sync_interval_hours * 3_600_000
      const lastSyncMs = profileCfg.last_sync_at ? new Date(profileCfg.last_sync_at).getTime() : 0
      const isDue = !profileCfg.last_sync_at || Date.now() - lastSyncMs >= intervalMs
      if (!isDue) {
        app.log.debug({ instanceId, profile_slug: profileCfg.profile_slug }, 'trash: profile not due yet')
        continue
      }
    }

    await syncOneProfile(
      instanceId, profileCfg, cfg, client,
      allUpstream, allActiveUpstreamSlugs, cachedProfiles,
      snapshot, deprecatedSlugs, trigger, app, commitInfo,
    )
  }
}

// ── Register sync function with scheduler ─────────────────────────────────────

// ── Routes ────────────────────────────────────────────────────────────────────

export async function trashRoutes(app: FastifyInstance) {
  const db = getDb()

  registerSyncFn(async (instanceId, trigger) => {
    await runSync(instanceId, trigger, app)
  }, app.log)

  // ── GET /api/trash/instances — list configured instances ──────────────────

  app.get('/api/trash/instances', { preHandler: [app.authenticate] }, async () => {
    const configs = db.prepare('SELECT * FROM trash_instance_configs ORDER BY created_at').all() as TrashInstanceConfig[]
    const allProfiles = db.prepare('SELECT * FROM trash_profile_configs ORDER BY position').all() as TrashProfileConfig[]
    return configs.map(c => {
      const profileConfigs = allProfiles
        .filter(p => p.instance_id === c.instance_id)
        .map(p => ({ ...p, enabled: p.enabled === 1 }))
      return {
        ...c,
        enabled: c.enabled === 1,
        isSyncing: isActivelySyncing(c.instance_id),
        profileConfigs,
      }
    })
  })

  // ── POST /api/trash/instances/:id/configure — instance-level config ────────

  interface ConfigureBody {
    sync_mode?: 'auto' | 'manual' | 'notify'
    sync_interval_hours?: number
    enabled?: boolean
    // legacy: profile_slug still accepted for backward compat
    profile_slug?: string | null
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

      const { sync_mode, sync_interval_hours, enabled, profile_slug } = req.body

      if (existing) {
        db.prepare(`
          UPDATE trash_instance_configs
          SET sync_mode    = COALESCE(?, sync_mode),
              sync_interval_hours = COALESCE(?, sync_interval_hours),
              enabled      = COALESCE(?, enabled),
              updated_at   = datetime('now')
          WHERE instance_id = ?
        `).run(
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

  // ── GET /api/trash/instances/:id/profile-configs ───────────────────────────

  app.get<{ Params: { id: string } }>(
    '/api/trash/instances/:id/profile-configs',
    { preHandler: [app.authenticate] },
    async (req) => {
      const rows = db.prepare(
        'SELECT * FROM trash_profile_configs WHERE instance_id = ? ORDER BY position'
      ).all(req.params.id) as TrashProfileConfig[]
      return rows.map(r => ({ ...r, enabled: r.enabled === 1 }))
    },
  )

  // ── POST /api/trash/instances/:id/profile-configs — add a profile ──────────

  interface AddProfileBody {
    profile_slug: string
    sync_mode?: 'auto' | 'manual' | 'notify'
    sync_interval_hours?: number
    enabled?: boolean
  }

  app.post<{ Params: { id: string }; Body: AddProfileBody }>(
    '/api/trash/instances/:id/profile-configs',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const { profile_slug, sync_mode, sync_interval_hours, enabled } = req.body
      if (!profile_slug?.trim()) return reply.status(400).send({ error: 'profile_slug is required' })

      const arrRow = db.prepare(
        'SELECT * FROM arr_instances WHERE id = ? AND (type = ? OR type = ?)'
      ).get(req.params.id, 'radarr', 'sonarr') as ArrInstanceRow | undefined
      if (!arrRow) return reply.status(404).send({ error: 'Arr instance not found or unsupported type' })

      // Ensure instance_config exists
      const existing = db.prepare(
        'SELECT id FROM trash_instance_configs WHERE instance_id = ?'
      ).get(req.params.id)
      if (!existing) {
        db.prepare(`
          INSERT INTO trash_instance_configs
            (id, instance_id, arr_type, sync_mode, sync_interval_hours, enabled)
          VALUES (?, ?, ?, 'notify', 24, 1)
        `).run(nanoid(), req.params.id, arrRow.type)
      }

      const duplicate = db.prepare(
        'SELECT id FROM trash_profile_configs WHERE instance_id = ? AND profile_slug = ?'
      ).get(req.params.id, profile_slug)
      if (duplicate) return reply.status(409).send({ error: 'Profile already configured for this instance' })

      const maxPos = (db.prepare(
        'SELECT COALESCE(MAX(position), -1) as p FROM trash_profile_configs WHERE instance_id = ?'
      ).get(req.params.id) as { p: number }).p

      const id = nanoid()
      db.prepare(`
        INSERT INTO trash_profile_configs
          (id, instance_id, arr_type, profile_slug, sync_mode, sync_interval_hours, enabled, position)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, req.params.id, arrRow.type, profile_slug,
        sync_mode ?? 'notify',
        sync_interval_hours ?? 24,
        enabled !== false ? 1 : 0,
        maxPos + 1,
      )

      rescheduleInstance(req.params.id)
      return { id, ok: true }
    },
  )

  // ── PATCH /api/trash/instances/:id/profile-configs/:profileSlug ────────────

  interface PatchProfileBody {
    sync_mode?: 'auto' | 'manual' | 'notify'
    sync_interval_hours?: number
    enabled?: boolean
  }

  app.patch<{ Params: { id: string; profileSlug: string }; Body: PatchProfileBody }>(
    '/api/trash/instances/:id/profile-configs/:profileSlug',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const row = db.prepare(
        'SELECT id FROM trash_profile_configs WHERE instance_id = ? AND profile_slug = ?'
      ).get(req.params.id, req.params.profileSlug)
      if (!row) return reply.status(404).send({ error: 'Profile config not found' })

      const { sync_mode, sync_interval_hours, enabled } = req.body
      db.prepare(`
        UPDATE trash_profile_configs
        SET sync_mode           = COALESCE(?, sync_mode),
            sync_interval_hours = COALESCE(?, sync_interval_hours),
            enabled             = COALESCE(?, enabled),
            updated_at          = datetime('now')
        WHERE instance_id = ? AND profile_slug = ?
      `).run(
        sync_mode ?? null,
        sync_interval_hours ?? null,
        enabled !== undefined ? (enabled ? 1 : 0) : null,
        req.params.id, req.params.profileSlug,
      )

      rescheduleInstance(req.params.id)
      return { ok: true }
    },
  )

  // ── DELETE /api/trash/instances/:id/profile-configs/:profileSlug ───────────

  app.delete<{ Params: { id: string; profileSlug: string } }>(
    '/api/trash/instances/:id/profile-configs/:profileSlug',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const row = db.prepare(
        'SELECT id FROM trash_profile_configs WHERE instance_id = ? AND profile_slug = ?'
      ).get(req.params.id, req.params.profileSlug)
      if (!row) return reply.status(404).send({ error: 'Profile config not found' })

      db.prepare('DELETE FROM trash_profile_configs WHERE instance_id = ? AND profile_slug = ?')
        .run(req.params.id, req.params.profileSlug)
      // Remove profile-scoped overrides and pending previews
      db.prepare('DELETE FROM trash_user_overrides WHERE instance_id = ? AND profile_slug = ?')
        .run(req.params.id, req.params.profileSlug)
      db.prepare('DELETE FROM trash_pending_previews WHERE instance_id = ? AND profile_slug = ?')
        .run(req.params.id, req.params.profileSlug)

      rescheduleInstance(req.params.id)
      return reply.status(204).send()
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

  // ── GET /api/trash/instances/:id/custom-formats — formats (optionally profile-filtered) ──

  app.get<{ Params: { id: string }; Querystring: { profile_slug?: string } }>(
    '/api/trash/instances/:id/custom-formats',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const cfg = db.prepare(
        'SELECT arr_type FROM trash_instance_configs WHERE instance_id = ?'
      ).get(req.params.id) as { arr_type: string } | undefined
      if (!cfg) return reply.status(404).send({ error: 'Not configured' })

      const requestedProfileSlug = req.query.profile_slug ?? null

      let formats = loadCachedFormats(cfg.arr_type as 'radarr' | 'sonarr')

      // Filter to formats in the requested profile
      if (requestedProfileSlug) {
        const cachedProfiles = loadCachedProfiles(cfg.arr_type as 'radarr' | 'sonarr')
        const prof = cachedProfiles.find(p => p.slug === requestedProfileSlug)
        if (prof) {
          const slugSet = new Set(prof.formatScores.map(fs => fs.formatSlug))
          formats = formats.filter(f => slugSet.has(f.slug))
        }
      }

      const overrides = db.prepare(
        'SELECT * FROM trash_user_overrides WHERE instance_id = ? AND profile_slug = ?'
      ).all(req.params.id, requestedProfileSlug ?? '') as TrashUserOverride[]
      const overrideMap = new Map(overrides.map(o => [o.slug, o]))

      const deprecated = db.prepare(
        'SELECT slug FROM trash_deprecated_formats WHERE instance_id = ?'
      ).all(req.params.id) as { slug: string }[]
      const deprecatedSet = new Set(deprecated.map(r => r.slug))

      const trashRows = formats.map(f => {
        const override = overrideMap.get(f.slug)
        return {
          slug: f.slug,
          name: f.name,
          recommendedScore: f.recommendedScore,
          score: override?.score ?? f.recommendedScore,
          enabled: override ? override.enabled === 1 : true,
          excluded: override ? override.excluded === 1 : false,
          deprecated: deprecatedSet.has(f.slug),
          arrFormatId: resolveArrId(req.params.id, f.slug),
          isUserFormat: false,
        }
      })

      // Include user custom formats — filtered by profile if specified, all for instance otherwise
      const userCustomRows = requestedProfileSlug
        ? db.prepare('SELECT * FROM trash_custom_formats WHERE instance_id = ? AND profile_slug = ?')
            .all(req.params.id, requestedProfileSlug) as UserCustomFormatDbRow[]
        : db.prepare('SELECT * FROM trash_custom_formats WHERE instance_id = ?')
            .all(req.params.id) as UserCustomFormatDbRow[]

      const userRows = userCustomRows.map(r => ({
        slug: r.slug,
        name: r.name,
        recommendedScore: r.score,
        score: r.score,
        enabled: r.enabled === 1,
        excluded: false,
        deprecated: false,
        arrFormatId: r.arr_format_id,
        isUserFormat: true,
      }))

      return [...trashRows, ...userRows]
    },
  )

  // ── GET /api/trash/instances/:id/overrides ─────────────────────────────────

  app.get<{ Params: { id: string }; Querystring: { profile_slug?: string } }>(
    '/api/trash/instances/:id/overrides',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const profileSlug = req.query.profile_slug
      if (profileSlug === undefined) return reply.status(400).send({ error: 'profile_slug query param is required' })
      return db.prepare(
        'SELECT * FROM trash_user_overrides WHERE instance_id = ? AND profile_slug = ?'
      ).all(req.params.id, profileSlug) as TrashUserOverride[]
    },
  )

  // ── PUT /api/trash/instances/:id/overrides — bulk upsert ──────────────────

  interface OverrideItem { slug: string; score?: number | null; enabled?: boolean; excluded?: boolean }
  interface OverridesBody { profile_slug: string; overrides: OverrideItem[] }

  app.put<{ Params: { id: string }; Body: OverridesBody }>(
    '/api/trash/instances/:id/overrides',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { profile_slug, overrides } = req.body
      if (profile_slug === undefined) return reply.status(400).send({ error: 'profile_slug is required' })
      if (!Array.isArray(overrides)) return reply.status(400).send({ error: 'overrides must be array' })

      const upsert = db.prepare(`
        INSERT INTO trash_user_overrides (id, instance_id, profile_slug, slug, score, enabled, excluded, updated_at)
        VALUES (
          COALESCE((SELECT id FROM trash_user_overrides WHERE instance_id=? AND profile_slug=? AND slug=?), ?),
          ?, ?, ?, ?, ?, ?, datetime('now')
        )
        ON CONFLICT(instance_id, profile_slug, slug)
        DO UPDATE SET score=excluded.score, enabled=excluded.enabled, excluded=excluded.excluded, updated_at=excluded.updated_at
      `)
      db.transaction((items: OverrideItem[]) => {
        for (const item of items) {
          upsert.run(
            req.params.id, profile_slug, item.slug, nanoid(),
            req.params.id, profile_slug, item.slug,
            item.score !== undefined ? item.score : null,
            item.enabled !== false ? 1 : 0,
            item.excluded === true ? 1 : 0,
          )
        }
      })(overrides)
      return { ok: true, updated: overrides.length }
    },
  )

  // ── POST /api/trash/instances/:id/sync ─────────────────────────────────────

  app.post<{ Params: { id: string }; Querystring: { profile_slug?: string } }>(
    '/api/trash/instances/:id/sync',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      if (isActivelySyncing(req.params.id)) {
        return reply.status(409).send({ error: 'Sync already in progress' })
      }
      if (!acquireSync(req.params.id)) {
        return reply.status(409).send({ error: 'Sync already in progress' })
      }
      const targetProfile = req.query.profile_slug
      runSync(req.params.id, 'manual', app, targetProfile)
        .catch(err => app.log.warn({ instanceId: req.params.id, err }, 'trash: manual sync failed'))
        .finally(() => releaseSync(req.params.id))
      return { ok: true, message: 'Sync started' }
    },
  )

  // ── GET /api/trash/instances/:id/preview ──────────────────────────────────

  app.get<{ Params: { id: string }; Querystring: { profile_slug?: string } }>(
    '/api/trash/instances/:id/preview',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const profileSlug = req.query.profile_slug ?? null
      const row = db.prepare(
        `SELECT * FROM trash_pending_previews
         WHERE instance_id = ?
           AND (? IS NULL OR profile_slug = ?)
           AND expires_at > datetime('now')
         ORDER BY created_at DESC LIMIT 1`
      ).get(req.params.id, profileSlug, profileSlug) as {
        id: string; diff: string; profile_slug: string;
        preview_base_sha: string; created_at: string; expires_at: string; is_stale: number
      } | undefined
      if (!row) return reply.status(404).send({ error: 'No pending preview' })

      const cfg = db.prepare(
        'SELECT arr_type FROM trash_instance_configs WHERE instance_id = ?'
      ).get(req.params.id) as { arr_type: string } | undefined
      const cacheRow = db.prepare(
        `SELECT github_sha FROM trash_guides_cache WHERE arr_type = ? LIMIT 1`
      ).get(cfg?.arr_type ?? '') as { github_sha: string } | undefined

      const isStale = cacheRow && row.preview_base_sha !== cacheRow.github_sha
      if (isStale) {
        db.prepare('UPDATE trash_pending_previews SET is_stale = 1 WHERE id = ?').run(row.id)
      }

      const changeset = JSON.parse(row.diff)
      return {
        id: row.id,
        instanceId: req.params.id,
        profileSlug: row.profile_slug,
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
      ).get(req.params.pid, req.params.id) as {
        diff: string; profile_slug: string; preview_base_sha: string; is_stale: number
      } | undefined
      if (!row) return reply.status(404).send({ error: 'Preview not found or expired' })
      if (row.is_stale) return reply.status(409).send({ error: 'Preview is stale — upstream changed. Re-sync first.' })
      if (isActivelySyncing(req.params.id)) return reply.status(409).send({ error: 'Sync already in progress' })

      if (!acquireSync(req.params.id)) return reply.status(409).send({ error: 'Sync already in progress' })
      runSync(req.params.id, 'user_confirm', app, row.profile_slug || undefined)
        .catch(err => app.log.warn({ instanceId: req.params.id, err }, 'trash: apply failed'))
        .finally(() => {
          releaseSync(req.params.id)
          db.prepare('DELETE FROM trash_pending_previews WHERE id = ?').run(req.params.pid)
        })
      return { ok: true, message: 'Applying changes' }
    },
  )

  // ── GET /api/trash/instances/:id/log — sync history ──────────────────────

  app.get<{ Params: { id: string }; Querystring: { limit?: string; profile_slug?: string } }>(
    '/api/trash/instances/:id/log',
    { preHandler: [app.authenticate] },
    async (req) => {
      const limit = Math.min(parseInt(req.query.limit ?? '50', 10), 200)
      const profileSlug = req.query.profile_slug ?? null
      if (profileSlug) {
        return db.prepare(
          'SELECT * FROM trash_sync_log WHERE instance_id = ? AND profile_slug = ? ORDER BY started_at DESC LIMIT ?'
        ).all(req.params.id, profileSlug, limit) as TrashSyncLog[]
      }
      return db.prepare(
        'SELECT * FROM trash_sync_log WHERE instance_id = ? ORDER BY started_at DESC LIMIT ?'
      ).all(req.params.id, limit) as TrashSyncLog[]
    },
  )

  // ── GET /api/trash/instances/:id/deprecated ───────────────────────────────

  app.get<{ Params: { id: string } }>(
    '/api/trash/instances/:id/deprecated',
    { preHandler: [app.authenticate] },
    async (req) => {
      return db.prepare(
        'SELECT * FROM trash_deprecated_formats WHERE instance_id = ? ORDER BY deprecated_at DESC'
      ).all(req.params.id) as TrashDeprecatedFormat[]
    },
  )

  // ── DELETE /api/trash/instances/:id/deprecated/:slug ─────────────────────

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

  // ── GET /api/trash/instances/:id/import-formats ───────────────────────────

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

  // ── POST /api/trash/instances/:id/import-formats ──────────────────────────

  interface ImportFormatsBody { format_ids: number[]; profile_slug?: string }

  app.post<{ Params: { id: string }; Body: ImportFormatsBody }>(
    '/api/trash/instances/:id/import-formats',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const { format_ids, profile_slug } = req.body
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
              (id, instance_id, source, arr_format_id, name, slug, score, specifications, enabled, profile_slug)
            VALUES (?, ?, 'imported', ?, ?, ?, 0, ?, 1, ?)
          `).run(nanoid(), req.params.id, fmt.id, fmt.name, slug, JSON.stringify(fmt.specifications), profile_slug ?? null)
          imported++
        } catch { /* skip individual failures */ }
      }
      return { ok: true, imported }
    },
  )

  // ── DELETE /api/trash/instances/:id/user-formats/:slug — remove user custom format ──

  app.delete<{ Params: { id: string; slug: string }; Querystring: { profile_slug?: string } }>(
    '/api/trash/instances/:id/user-formats/:slug',
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const { id, slug } = req.params
      const { profile_slug } = req.query
      if (profile_slug) {
        db.prepare('DELETE FROM trash_custom_formats WHERE instance_id = ? AND slug = ? AND profile_slug = ?')
          .run(id, slug, profile_slug)
      } else {
        db.prepare('DELETE FROM trash_custom_formats WHERE instance_id = ? AND slug = ?')
          .run(id, slug)
      }
      return reply.status(204).send()
    },
  )

  // ── GET /api/trash/sync-status — widget stats ─────────────────────────────

  app.get('/api/trash/sync-status', { logLevel: 'silent', preHandler: [app.authenticate] }, async () => {
    const configs = db.prepare('SELECT * FROM trash_instance_configs WHERE enabled = 1').all() as TrashInstanceConfig[]
    const instances: TrashWidgetStats['instances'] = []

    for (const cfg of configs) {
      const arrRow = db.prepare('SELECT name FROM arr_instances WHERE id = ?').get(cfg.instance_id) as { name: string } | undefined
      const profileConfigs = db.prepare(
        'SELECT * FROM trash_profile_configs WHERE instance_id = ? AND enabled = 1 ORDER BY position'
      ).all(cfg.instance_id) as TrashProfileConfig[]

      const profiles: TrashWidgetStats['instances'][number]['profiles'] = []
      for (const p of profileConfigs) {
        const lastLog = db.prepare(
          `SELECT status FROM trash_sync_log WHERE instance_id = ? AND profile_slug = ? ORDER BY started_at DESC LIMIT 1`
        ).get(cfg.instance_id, p.profile_slug) as { status: string } | undefined
        const pendingPreview = db.prepare(
          `SELECT 1 FROM trash_pending_previews WHERE instance_id = ? AND profile_slug = ? AND expires_at > datetime('now') AND is_stale = 0 LIMIT 1`
        ).get(cfg.instance_id, p.profile_slug)
        profiles.push({
          profileSlug: p.profile_slug,
          syncMode: p.sync_mode,
          lastSyncAt: p.last_sync_at,
          lastSyncStatus: (lastLog?.status ?? null) as TrashWidgetStats['instances'][number]['profiles'][number]['lastSyncStatus'],
          pendingReview: !!pendingPreview,
        })
      }

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
        profiles,
        formatsActive: activeFmts.cnt,
        formatsDeprecated: deprecatedFmts.cnt,
        isCurrentlySyncing: isActivelySyncing(cfg.instance_id),
      })
    }

    const result: TrashWidgetStats = { type: 'trash_guides', instances }
    return result
  })

  // ── POST /api/trash/github/fetch — force re-fetch ─────────────────────────

  app.post('/api/trash/github/fetch', { preHandler: [app.requireAdmin] }, async (_, reply) => {
    try {
      const commitInfo = await fetchLatestCommit()
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
