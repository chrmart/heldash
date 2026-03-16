import { FastifyInstance } from 'fastify'
import { nanoid } from 'nanoid'
import { getDb } from '../db/database'
import { stringify } from 'yaml'
import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'
import * as cron from 'node-cron'

interface RecyclarrProfile {
  trash_id: string
  name: string
  mediaType: 'radarr' | 'sonarr'
  group: string
  source: 'container' | 'cache'
}

interface RecyclarrCf {
  trash_id: string
  name: string
  mediaType: 'radarr' | 'sonarr'
}

interface ProfileConfig {
  trash_id: string
  name: string
  min_format_score?: number
  reset_unmatched_scores_enabled: boolean
  reset_unmatched_scores_except: string[]
}

interface RecyclarrConfigRow {
  id: string
  instance_id: string
  enabled: number
  templates: string
  score_overrides: string
  user_cf_names: string
  preferred_ratio: number
  profiles_config: string
  sync_schedule: string
  last_synced_at: string | null
  last_sync_success: number | null
  delete_old_cfs: number
  is_syncing: number
  updated_at: string
}

interface ArrInstanceRow {
  id: string
  name: string
  type: string
  url: string
  api_key: string
}

interface ScoreOverride {
  trash_id: string
  name: string
  score: number
  profileTrashId: string
}

interface UserCf {
  name: string
  score: number
  profileTrashId: string
  profileName: string
}

interface SaveConfigBody {
  enabled: boolean
  selectedProfiles: string[]
  scoreOverrides: ScoreOverride[]
  userCfNames: UserCf[]
  preferredRatio: number
  profilesConfig: ProfileConfig[]
  syncSchedule: string
  deleteOldCfs: boolean
}

interface RecyclarrConfig {
  instanceId: string
  enabled: boolean
  selectedProfiles: string[]
  scoreOverrides: ScoreOverride[]
  userCfNames: UserCf[]
  preferredRatio: number
  profilesConfig: ProfileConfig[]
  deleteOldCfs: boolean
}

interface SimpleLogger {
  info: (obj: object, msg?: string) => void
  warn: (obj: object, msg?: string) => void
  error: (obj: object, msg?: string) => void
}

function getSettingStr(key: string, fallback: string): string {
  const db = getDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  if (!row) return fallback
  try { return JSON.parse(row.value) as string } catch { return row.value }
}

function delSetting(key: string): void {
  const db = getDb()
  db.prepare('DELETE FROM settings WHERE key = ?').run(key)
}

function getSettingJson<T>(key: string): T | null {
  const db = getDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  if (!row) return null
  try { return JSON.parse(row.value) as T } catch { return null }
}

function setSettingJson(key: string, value: unknown): void {
  const db = getDb()
  db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(key, JSON.stringify(value))
}

function getRecyclarrSettings(): { containerName: string; configPath: string } {
  return {
    containerName: getSettingStr('recyclarr_container_name', 'recyclarr'),
    configPath: getSettingStr('recyclarr_config_path', '/recyclarr/recyclarr.yml'),
  }
}

function runDockerCommand(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('docker', args)
    let stdout = ''
    let stderr = ''
    if (proc.stdout) proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    if (proc.stderr) proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `docker exited with code ${code}`))
      } else {
        resolve(stdout)
      }
    })
    proc.on('error', err => reject(err))
  })
}

function deriveGroup(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('german') || lower.includes('deutsch')) return 'Deutsch (German)'
  if (lower.includes('anime')) return 'Anime'
  if (lower.includes('french')) return 'French'
  if (lower.includes('dutch')) return 'Dutch'
  return 'Standard'
}

function parseQualityProfiles(stdout: string, mediaType: 'radarr' | 'sonarr', source: 'container' | 'cache'): RecyclarrProfile[] {
  const profiles: RecyclarrProfile[] = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parts = trimmed.split('\t')
    const trash_id = parts[0]?.trim() ?? ''
    const name = parts[1]?.trim() ?? ''
    if (!/^[0-9a-f]{32}$/i.test(trash_id) || !name) continue
    profiles.push({ trash_id, name, mediaType, group: deriveGroup(name), source })
  }
  return profiles
}

const CF_LINE_RE = /^\s*-\s+([0-9a-f]{32})\s+#\s+(.+)$/i

function parseCustomFormats(stdout: string, mediaType: 'radarr' | 'sonarr'): RecyclarrCf[] {
  const cfs: RecyclarrCf[] = []
  for (const line of stdout.split('\n')) {
    const m = CF_LINE_RE.exec(line)
    if (!m) continue
    const trash_id = m[1]
    const name = m[2]?.trim()
    if (trash_id && name) cfs.push({ trash_id, name, mediaType })
  }
  return cfs
}

interface ProfilesCacheEntry { profiles: RecyclarrProfile[]; fetchedAt: string }
interface CfsCacheEntry { cfs: RecyclarrCf[]; fetchedAt: string }
const CACHE_TTL = 24 * 60 * 60 * 1000

async function getQualityProfiles(
  service: 'radarr' | 'sonarr',
  containerName: string,
  forceRefresh = false
): Promise<{ profiles: RecyclarrProfile[]; warning: boolean }> {
  const cacheKey = `recyclarr_profiles_cache_${service}`
  if (!forceRefresh) {
    const cached = getSettingJson<ProfilesCacheEntry>(cacheKey)
    if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL) {
      return { profiles: cached.profiles.map(p => ({ ...p, source: 'cache' as const })), warning: false }
    }
  }
  try {
    const stdout = await runDockerCommand(['exec', containerName, 'recyclarr', 'list', 'quality-profiles', service, '--raw'])
    const profiles = parseQualityProfiles(stdout, service, 'container')
    const entry: ProfilesCacheEntry = { profiles, fetchedAt: new Date().toISOString() }
    setSettingJson(cacheKey, entry)
    return { profiles, warning: false }
  } catch (e) {
    const cached = getSettingJson<ProfilesCacheEntry>(cacheKey)
    if (cached) {
      return { profiles: cached.profiles.map(p => ({ ...p, source: 'cache' as const })), warning: true }
    }
    throw e
  }
}

async function getCustomFormats(
  service: 'radarr' | 'sonarr',
  containerName: string,
  forceRefresh = false
): Promise<{ cfs: RecyclarrCf[]; warning: boolean }> {
  const cacheKey = `recyclarr_cf_cache_${service}`
  if (!forceRefresh) {
    const cached = getSettingJson<CfsCacheEntry>(cacheKey)
    if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL) {
      return { cfs: cached.cfs, warning: false }
    }
  }
  try {
    const stdout = await runDockerCommand(['exec', containerName, 'recyclarr', 'list', 'custom-formats', service, '--raw'])
    const cfs = parseCustomFormats(stdout, service)
    const entry: CfsCacheEntry = { cfs, fetchedAt: new Date().toISOString() }
    setSettingJson(cacheKey, entry)
    return { cfs, warning: false }
  } catch (e) {
    const cached = getSettingJson<CfsCacheEntry>(cacheKey)
    if (cached) return { cfs: cached.cfs, warning: true }
    throw e
  }
}

function deriveQdType(instType: string, profileNames: string[]): string {
  if (instType === 'radarr') return 'movie'
  if (profileNames.some(n => n.toLowerCase().includes('anime'))) return 'anime'
  return 'series'
}

function generateRecyclarrYaml(configs: RecyclarrConfig[], instances: ArrInstanceRow[]): string {
  const radarr: Record<string, unknown> = {}
  const sonarr: Record<string, unknown> = {}

  for (const cfg of configs) {
    if (!cfg.enabled) continue
    const inst = instances.find(i => i.id === cfg.instanceId)
    if (!inst || (inst.type !== 'radarr' && inst.type !== 'sonarr')) continue

    const profileNames = cfg.profilesConfig.map(pc => pc.name)
    const qdType = deriveQdType(inst.type, profileNames)

    const qualityDefinition: Record<string, unknown> = { type: qdType }
    if (cfg.preferredRatio > 0) qualityDefinition.preferred_ratio = cfg.preferredRatio

    const qualityProfiles = cfg.profilesConfig.map(pc => {
      const entry: Record<string, unknown> = { trash_id: pc.trash_id }
      if (pc.min_format_score != null && pc.min_format_score > 0) {
        entry.min_format_score = pc.min_format_score
      }
      if (pc.reset_unmatched_scores_enabled) {
        const rusObj: Record<string, unknown> = { enabled: true }
        if (pc.reset_unmatched_scores_except.length > 0) {
          rusObj.except = pc.reset_unmatched_scores_except
        }
        entry.reset_unmatched_scores = rusObj
      }
      return entry
    })

    const customFormats: unknown[] = []

    const groupedOverrides: Record<string, { trash_ids: string[]; profileTrashId: string; score: number }> = {}
    for (const o of cfg.scoreOverrides) {
      const key = `${o.profileTrashId}::${o.score}`
      if (!groupedOverrides[key]) {
        groupedOverrides[key] = { trash_ids: [], profileTrashId: o.profileTrashId, score: o.score }
      }
      groupedOverrides[key].trash_ids.push(o.trash_id)
    }
    for (const g of Object.values(groupedOverrides)) {
      customFormats.push({
        trash_ids: g.trash_ids,
        assign_scores_to: [{ trash_id: g.profileTrashId, score: g.score }],
      })
    }

    for (const ucf of cfg.userCfNames) {
      customFormats.push({
        trash_ids: [ucf.name],
        assign_scores_to: [{ trash_id: ucf.profileTrashId, score: ucf.score }],
      })
    }

    const instanceKey = inst.name.replace(/\s+/g, '-')
    const instanceConfig: Record<string, unknown> = {
      base_url: inst.url,
      api_key: inst.api_key,
      quality_definition: qualityDefinition,
    }
    if (qualityProfiles.length > 0) instanceConfig.quality_profiles = qualityProfiles
    if (customFormats.length > 0) instanceConfig.custom_formats = customFormats
    if (cfg.deleteOldCfs) instanceConfig.delete_old_custom_formats = true

    if (inst.type === 'radarr') radarr[instanceKey] = instanceConfig
    else sonarr[instanceKey] = instanceConfig
  }

  const doc: Record<string, unknown> = {}
  if (Object.keys(radarr).length > 0) doc.radarr = radarr
  if (Object.keys(sonarr).length > 0) doc.sonarr = sonarr
  return stringify(doc)
}

async function writeYaml(configs: RecyclarrConfig[], instances: ArrInstanceRow[]): Promise<void> {
  const { configPath } = getRecyclarrSettings()
  const yaml = generateRecyclarrYaml(configs, instances)
  const dir = path.dirname(configPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(configPath, yaml, 'utf8')
}

function safeJson<T>(str: string, fallback: T): T {
  try { return JSON.parse(str) as T } catch { return fallback }
}

function rowToConfig(row: RecyclarrConfigRow): RecyclarrConfig {
  return {
    instanceId: row.instance_id,
    enabled: row.enabled === 1,
    selectedProfiles: safeJson<string[]>(row.templates, []),
    scoreOverrides: safeJson<ScoreOverride[]>(row.score_overrides, []),
    userCfNames: safeJson<UserCf[]>(row.user_cf_names, []),
    preferredRatio: row.preferred_ratio ?? 0,
    profilesConfig: safeJson<ProfileConfig[]>(row.profiles_config, []),
    deleteOldCfs: row.delete_old_cfs === 1,
  }
}

const scheduledTasks: Map<string, cron.ScheduledTask> = new Map()

export function scheduleRecyclarrSync(instanceId: string, schedule: string, logger: SimpleLogger): void {
  const existing = scheduledTasks.get(instanceId)
  if (existing) { existing.stop(); scheduledTasks.delete(instanceId) }
  if (!schedule || schedule === 'manual') return
  if (!cron.validate(schedule)) {
    logger.warn({ instanceId, schedule }, 'Invalid cron schedule for recyclarr sync')
    return
  }
  const task = cron.schedule(schedule, async () => {
    logger.info({ instanceId }, 'Running scheduled recyclarr sync')
    try {
      const db = getDb()
      const row = db.prepare('SELECT * FROM recyclarr_configs WHERE instance_id = ?').get(instanceId) as RecyclarrConfigRow | undefined
      if (!row || !row.enabled) return
      const inUse = db.prepare('SELECT 1 FROM recyclarr_configs WHERE is_syncing = 1').get()
      if (inUse) { logger.warn({ instanceId }, 'Recyclarr sync already running, skipping'); return }
      db.prepare('UPDATE recyclarr_configs SET is_syncing = 1 WHERE instance_id = ?').run(instanceId)
      const { containerName } = getRecyclarrSettings()
      try {
        await runDockerCommand(['exec', containerName, 'recyclarr', 'sync'])
        db.prepare("UPDATE recyclarr_configs SET is_syncing = 0, last_synced_at = datetime('now'), last_sync_success = 1 WHERE instance_id = ?").run(instanceId)
      } catch (e) {
        db.prepare("UPDATE recyclarr_configs SET is_syncing = 0, last_synced_at = datetime('now'), last_sync_success = 0 WHERE instance_id = ?").run(instanceId)
        logger.error({ instanceId, err: e }, 'Scheduled recyclarr sync failed')
      }
    } catch (e) {
      logger.error({ instanceId, err: e }, 'Scheduled recyclarr sync error')
    }
  })
  scheduledTasks.set(instanceId, task)
  logger.info({ instanceId, schedule }, 'Scheduled recyclarr sync')
}

export function initRecyclarrSchedulers(logger: SimpleLogger): void {
  try {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM recyclarr_configs WHERE enabled = 1').all() as RecyclarrConfigRow[]
    for (const row of rows) {
      if (row.sync_schedule && row.sync_schedule !== 'manual') {
        scheduleRecyclarrSync(row.instance_id, row.sync_schedule, logger)
      }
    }
  } catch (e) {
    logger.warn({ err: e }, 'Could not init recyclarr schedulers')
  }
}

export default async function recyclarrRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/recyclarr/profiles/:service
  app.get<{ Params: { service: string }; Querystring: { refresh?: string } }>(
    '/api/recyclarr/profiles/:service',
    async (req, reply) => {
      const service = req.params.service as 'radarr' | 'sonarr'
      if (service !== 'radarr' && service !== 'sonarr') return reply.status(400).send({ error: 'service must be radarr or sonarr' })
      const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true'
      const { containerName } = getRecyclarrSettings()
      try {
        const result = await getQualityProfiles(service, containerName, forceRefresh)
        return reply.send(result)
      } catch (e) {
        return reply.status(500).send({ error: e instanceof Error ? e.message : 'Failed to fetch profiles' })
      }
    }
  )

  // GET /api/recyclarr/cfs/:service
  app.get<{ Params: { service: string }; Querystring: { refresh?: string } }>(
    '/api/recyclarr/cfs/:service',
    async (req, reply) => {
      const service = req.params.service as 'radarr' | 'sonarr'
      if (service !== 'radarr' && service !== 'sonarr') return reply.status(400).send({ error: 'service must be radarr or sonarr' })
      const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true'
      const { containerName } = getRecyclarrSettings()
      try {
        const result = await getCustomFormats(service, containerName, forceRefresh)
        return reply.send(result)
      } catch (e) {
        return reply.status(500).send({ error: e instanceof Error ? e.message : 'Failed to fetch custom formats' })
      }
    }
  )

  // GET /api/recyclarr/configs
  app.get('/api/recyclarr/configs', async (req, reply) => {
    const db = getDb()
    const rows = db.prepare(`
      SELECT rc.*, ai.name as instance_name, ai.type as instance_type
      FROM recyclarr_configs rc
      JOIN arr_instances ai ON rc.instance_id = ai.id
      WHERE ai.type IN ('radarr','sonarr')
      ORDER BY ai.name
    `).all() as (RecyclarrConfigRow & { instance_name: string; instance_type: string })[]

    const configs = rows.map(row => ({
      instanceId: row.instance_id,
      instanceName: row.instance_name,
      instanceType: row.instance_type as 'radarr' | 'sonarr',
      enabled: row.enabled === 1,
      selectedProfiles: safeJson<string[]>(row.templates, []),
      scoreOverrides: safeJson<ScoreOverride[]>(row.score_overrides, []),
      userCfNames: safeJson<UserCf[]>(row.user_cf_names, []),
      preferredRatio: row.preferred_ratio ?? 0,
      profilesConfig: safeJson<ProfileConfig[]>(row.profiles_config, []),
      syncSchedule: row.sync_schedule ?? 'manual',
      lastSyncedAt: row.last_synced_at,
      lastSyncSuccess: row.last_sync_success === null ? null : row.last_sync_success === 1,
      deleteOldCfs: row.delete_old_cfs === 1,
      isSyncing: row.is_syncing === 1,
    }))
    return reply.send({ configs })
  })

  // POST /api/recyclarr/configs/:instanceId
  app.post<{ Params: { instanceId: string }; Body: SaveConfigBody }>(
    '/api/recyclarr/configs/:instanceId',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { instanceId } = req.params
      const db = getDb()
      const inst = db.prepare('SELECT * FROM arr_instances WHERE id = ?').get(instanceId) as ArrInstanceRow | undefined
      if (!inst) return reply.status(404).send({ error: 'Instance not found' })
      if (inst.type !== 'radarr' && inst.type !== 'sonarr') return reply.status(400).send({ error: 'Only radarr/sonarr instances supported' })

      const body = req.body
      const existing = db.prepare('SELECT id FROM recyclarr_configs WHERE instance_id = ?').get(instanceId) as { id: string } | undefined

      if (existing) {
        db.prepare(`UPDATE recyclarr_configs SET
          enabled = ?, templates = ?, score_overrides = ?, user_cf_names = ?,
          preferred_ratio = ?, profiles_config = ?, sync_schedule = ?, delete_old_cfs = ?,
          updated_at = datetime('now')
          WHERE instance_id = ?`).run(
          body.enabled ? 1 : 0,
          JSON.stringify(body.selectedProfiles ?? []),
          JSON.stringify(body.scoreOverrides ?? []),
          JSON.stringify(body.userCfNames ?? []),
          body.preferredRatio ?? 0,
          JSON.stringify(body.profilesConfig ?? []),
          body.syncSchedule ?? 'manual',
          body.deleteOldCfs ? 1 : 0,
          instanceId
        )
      } else {
        const id = nanoid()
        db.prepare(`INSERT INTO recyclarr_configs
          (id, instance_id, enabled, templates, score_overrides, user_cf_names, preferred_ratio, profiles_config, sync_schedule, delete_old_cfs, is_syncing, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`).run(
          id, instanceId,
          body.enabled ? 1 : 0,
          JSON.stringify(body.selectedProfiles ?? []),
          JSON.stringify(body.scoreOverrides ?? []),
          JSON.stringify(body.userCfNames ?? []),
          body.preferredRatio ?? 0,
          JSON.stringify(body.profilesConfig ?? []),
          body.syncSchedule ?? 'manual',
          body.deleteOldCfs ? 1 : 0
        )
      }

      scheduleRecyclarrSync(instanceId, body.syncSchedule ?? 'manual', app.log)

      try {
        const allRows = db.prepare('SELECT * FROM recyclarr_configs WHERE enabled = 1').all() as RecyclarrConfigRow[]
        const allInsts = db.prepare('SELECT * FROM arr_instances').all() as ArrInstanceRow[]
        const allConfigs = allRows.map(rowToConfig)
        await writeYaml(allConfigs, allInsts)
      } catch (e) {
        app.log.warn({ err: e }, 'Failed to write recyclarr YAML after save')
      }

      return reply.send({ ok: true })
    }
  )

  // GET /api/recyclarr/yaml-preview
  app.get('/api/recyclarr/yaml-preview', { onRequest: [app.authenticate] }, async (req, reply) => {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM recyclarr_configs WHERE enabled = 1').all() as RecyclarrConfigRow[]
    const insts = db.prepare('SELECT * FROM arr_instances').all() as ArrInstanceRow[]
    const configs = rows.map(rowToConfig)
    const yaml = generateRecyclarrYaml(configs, insts)
    return reply.send({ yaml })
  })

  // POST /api/recyclarr/reset
  app.post('/api/recyclarr/reset', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const db = getDb()
    db.prepare('UPDATE recyclarr_configs SET enabled = 0, templates = ?, score_overrides = ?, user_cf_names = ?, preferred_ratio = 0, profiles_config = ?, sync_schedule = ?, delete_old_cfs = 0 WHERE 1=1').run(
      JSON.stringify([]), JSON.stringify([]), JSON.stringify([]), JSON.stringify([]), 'manual'
    )
    for (const [, task] of scheduledTasks.entries()) {
      task.stop()
    }
    scheduledTasks.clear()
    try {
      await writeYaml([], [])
    } catch (e) {
      app.log.warn({ err: e }, 'Failed to write empty recyclarr YAML after reset')
    }
    return reply.send({ ok: true })
  })

  // POST /api/recyclarr/sync/:instanceId  (SSE streaming)
  app.post<{ Params: { instanceId: string } }>(
    '/api/recyclarr/sync/:instanceId',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { instanceId } = req.params
      const db = getDb()
      const inst = db.prepare('SELECT * FROM arr_instances WHERE id = ?').get(instanceId) as ArrInstanceRow | undefined
      if (!inst) return reply.status(404).send({ error: 'Instance not found' })

      const inUse = db.prepare('SELECT 1 FROM recyclarr_configs WHERE is_syncing = 1').get()
      if (inUse) return reply.status(409).send({ error: 'A sync is already running' })

      db.prepare('UPDATE recyclarr_configs SET is_syncing = 1 WHERE instance_id = ?').run(instanceId)

      reply.hijack()
      const raw = reply.raw
      raw.setHeader('Content-Type', 'text/event-stream')
      raw.setHeader('Cache-Control', 'no-cache')
      raw.setHeader('Connection', 'keep-alive')
      raw.flushHeaders()

      const send = (line: string, type: 'stdout' | 'stderr' | 'done' | 'error') => {
        raw.write(`data: ${JSON.stringify({ line, type })}\n\n`)
      }

      const { containerName } = getRecyclarrSettings()
      const proc = spawn('docker', ['exec', containerName, 'recyclarr', 'sync', '--app', inst.type])
      if (proc.stdout) proc.stdout.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString('utf8').split('\n')) {
          if (line.trim()) send(line, 'stdout')
        }
      })
      if (proc.stderr) proc.stderr.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString('utf8').split('\n')) {
          if (line.trim()) send(line, 'stderr')
        }
      })
      proc.on('close', code => {
        const success = code === 0
        db.prepare("UPDATE recyclarr_configs SET is_syncing = 0, last_synced_at = datetime('now'), last_sync_success = ? WHERE instance_id = ?").run(success ? 1 : 0, instanceId)
        if (success) send('Sync completed successfully', 'done')
        else send(`Sync failed with exit code ${code}`, 'error')
        raw.end()
      })
      proc.on('error', err => {
        db.prepare('UPDATE recyclarr_configs SET is_syncing = 0 WHERE instance_id = ?').run(instanceId)
        send(err.message, 'error')
        raw.end()
      })
    }
  )

  // POST /api/recyclarr/global-sync  (SSE streaming)
  app.post('/api/recyclarr/global-sync', { onRequest: [app.authenticate] }, async (req, reply) => {
    const db = getDb()
    const inUse = db.prepare('SELECT 1 FROM recyclarr_configs WHERE is_syncing = 1').get()
    if (inUse) return reply.status(409).send({ error: 'A sync is already running' })

    reply.hijack()
    const raw = reply.raw
    raw.setHeader('Content-Type', 'text/event-stream')
    raw.setHeader('Cache-Control', 'no-cache')
    raw.setHeader('Connection', 'keep-alive')
    raw.flushHeaders()

    const send = (line: string, type: 'stdout' | 'stderr' | 'done' | 'error') => {
      raw.write(`data: ${JSON.stringify({ line, type })}\n\n`)
    }

    db.prepare('UPDATE recyclarr_configs SET is_syncing = 1 WHERE enabled = 1').run()
    const { containerName } = getRecyclarrSettings()
    const proc = spawn('docker', ['exec', containerName, 'recyclarr', 'sync'])
    if (proc.stdout) proc.stdout.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split('\n')) {
        if (line.trim()) send(line, 'stdout')
      }
    })
    if (proc.stderr) proc.stderr.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split('\n')) {
        if (line.trim()) send(line, 'stderr')
      }
    })
    proc.on('close', code => {
      const success = code === 0
      db.prepare("UPDATE recyclarr_configs SET is_syncing = 0, last_synced_at = datetime('now'), last_sync_success = ? WHERE enabled = 1").run(success ? 1 : 0)
      if (success) send('Global sync completed successfully', 'done')
      else send(`Global sync failed with exit code ${code}`, 'error')
      raw.end()
    })
    proc.on('error', err => {
      db.prepare('UPDATE recyclarr_configs SET is_syncing = 0 WHERE enabled = 1').run()
      send(err.message, 'error')
      raw.end()
    })
  })

  // DELETE /api/recyclarr/cache/:service
  app.delete<{ Params: { service: string } }>(
    '/api/recyclarr/cache/:service',
    { onRequest: [app.requireAdmin] },
    async (req, reply) => {
      const service = req.params.service
      if (service !== 'radarr' && service !== 'sonarr') return reply.status(400).send({ error: 'service must be radarr or sonarr' })
      delSetting(`recyclarr_profiles_cache_${service}`)
      delSetting(`recyclarr_cf_cache_${service}`)
      return reply.send({ ok: true })
    }
  )
}
