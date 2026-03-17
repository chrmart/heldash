import { FastifyInstance } from 'fastify'
import { nanoid } from 'nanoid'
import { getDb } from '../db/database'
import { stringify } from 'yaml'
import * as fs from 'fs'
import * as path from 'path'
import { Pool } from 'undici'
import * as cron from 'node-cron'

const dockerPool = new Pool('http://localhost', {
  socketPath: '/var/run/docker.sock',
  connections: 5,
})

async function dockerExecInContainer(
  containerName: string,
  cmd: string[],
  timeoutMs = 30_000
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const createRes = await dockerPool.request({
    path: `/v1.41/containers/${containerName}/exec`,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ AttachStdout: true, AttachStderr: true, Cmd: cmd }),
  })
  if (createRes.statusCode === 404) {
    await createRes.body.dump()
    throw new Error(`Container '${containerName}' not found. Check container name in settings.`)
  }
  if (createRes.statusCode !== 201) {
    const body = await createRes.body.text()
    throw new Error(`Docker exec create failed (${createRes.statusCode}): ${body}`)
  }
  const { Id: execId } = await createRes.body.json() as { Id: string }

  const startRes = await dockerPool.request({
    path: `/v1.41/exec/${execId}/start`,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ Detach: false, Tty: false }),
  })
  if (startRes.statusCode !== 200) {
    const body = await startRes.body.text()
    throw new Error(`Docker exec start failed (${startRes.statusCode}): ${body}`)
  }

  const stdoutChunks: Buffer[] = []
  const stderrChunks: Buffer[] = []
  let buf = Buffer.alloc(0)

  const timeout = setTimeout(() => startRes.body.destroy(), timeoutMs)
  try {
    for await (const chunk of startRes.body) {
      buf = Buffer.concat([buf, chunk as Buffer])
      while (true) {
        if (buf.length < 8) break
        const streamByte = buf[0]
        const size = buf.readUInt32BE(4)
        if (buf.length < 8 + size) break
        const payload = buf.subarray(8, 8 + size)
        buf = buf.subarray(8 + size)
        if (streamByte === 2) stderrChunks.push(payload)
        else stdoutChunks.push(payload)
      }
    }
  } finally {
    clearTimeout(timeout)
  }

  const inspectRes = await dockerPool.request({ path: `/v1.41/exec/${execId}/json`, method: 'GET' })
  const inspectJson = await inspectRes.body.json() as { ExitCode: number; Running: boolean }

  return {
    stdout: Buffer.concat(stdoutChunks).toString('utf8'),
    stderr: Buffer.concat(stderrChunks).toString('utf8'),
    exitCode: inspectJson.ExitCode ?? 1,
  }
}

async function streamingDockerExec(
  containerName: string,
  cmd: string[],
  onLine: (stream: 'stdout' | 'stderr', line: string) => void,
  timeoutMs = 300_000
): Promise<number> {
  const createRes = await dockerPool.request({
    path: `/v1.41/containers/${containerName}/exec`,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ AttachStdout: true, AttachStderr: true, Cmd: cmd }),
  })
  if (createRes.statusCode === 404) {
    await createRes.body.dump()
    throw new Error(`Container '${containerName}' not found. Check container name in settings.`)
  }
  if (createRes.statusCode !== 201) {
    const body = await createRes.body.text()
    throw new Error(`Docker exec create failed (${createRes.statusCode}): ${body}`)
  }
  const { Id: execId } = await createRes.body.json() as { Id: string }

  const startRes = await dockerPool.request({
    path: `/v1.41/exec/${execId}/start`,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ Detach: false, Tty: false }),
  })
  if (startRes.statusCode !== 200) {
    const body = await startRes.body.text()
    throw new Error(`Docker exec start failed (${startRes.statusCode}): ${body}`)
  }

  let buf = Buffer.alloc(0)
  const timeout = setTimeout(() => startRes.body.destroy(), timeoutMs)
  try {
    for await (const chunk of startRes.body) {
      buf = Buffer.concat([buf, chunk as Buffer])
      while (true) {
        if (buf.length < 8) break
        const streamByte = buf[0]
        const size = buf.readUInt32BE(4)
        if (buf.length < 8 + size) break
        const payload = buf.subarray(8, 8 + size)
        buf = buf.subarray(8 + size)
        const stream = streamByte === 2 ? 'stderr' : 'stdout'
        for (const line of payload.toString('utf8').split('\n')) {
          if (line.trim()) onLine(stream, line)
        }
      }
    }
  } finally {
    clearTimeout(timeout)
  }

  const inspectRes = await dockerPool.request({ path: `/v1.41/exec/${execId}/json`, method: 'GET' })
  const inspectJson = await inspectRes.body.json() as { ExitCode: number; Running: boolean }
  return inspectJson.ExitCode ?? 1
}

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
  trash_id?: string
  name: string
  score: number
  profileTrashId: string
  profileName: string
}

interface UserCfSpecification {
  name: string
  implementation: string
  negate: boolean
  required: boolean
  fields: { name: string; value: unknown }[]
}

interface UserCfFile {
  trash_id: string
  name: string
  includeCustomFormatWhenRenaming: boolean
  specifications: UserCfSpecification[]
}

interface CreateUserCfBody {
  name: string
  specifications: UserCfSpecification[]
}

interface UpdateUserCfBody {
  name: string
  specifications: UserCfSpecification[]
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

const USER_CF_BASE = '/recyclarr/user-cfs'
const SETTINGS_YML_PATH = '/recyclarr/settings.yml'

function toUserCfSlug(name: string): string {
  return 'user-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function ensureUserCfFolders(): void {
  fs.mkdirSync(`${USER_CF_BASE}/radarr`, { recursive: true })
  fs.mkdirSync(`${USER_CF_BASE}/sonarr`, { recursive: true })
}

function writeSettingsYml(): void {
  const content = [
    '# yaml-language-server: $schema=https://raw.githubusercontent.com/recyclarr/recyclarr/master/schemas/settings-schema.json',
    'resource_providers:',
    '  - name: user-cfs-radarr',
    '    type: custom-formats',
    '    path: /config/user-cfs/radarr',
    '    service: radarr',
    '  - name: user-cfs-sonarr',
    '    type: custom-formats',
    '    path: /config/user-cfs/sonarr',
    '    service: sonarr',
  ].join('\n') + '\n'
  const dir = path.dirname(SETTINGS_YML_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(SETTINGS_YML_PATH, content, 'utf8')
}

function listUserCfs(service: 'radarr' | 'sonarr'): UserCfFile[] {
  const folder = path.join(USER_CF_BASE, service)
  ensureUserCfFolders()
  let files: string[]
  try { files = fs.readdirSync(folder).filter(f => f.endsWith('.json')) } catch { return [] }
  const result: UserCfFile[] = []
  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(folder, f), 'utf8')
      result.push(JSON.parse(content) as UserCfFile)
    } catch { /* skip malformed files */ }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
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
  const seen = new Set<string>()
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Try tab-separated --raw format: trash_id\tname
    const parts = trimmed.split('\t')
    const trash_id_tab = parts[0]?.trim() ?? ''
    const name_tab = parts[1]?.trim() ?? ''
    if (/^[0-9a-f]{32}$/i.test(trash_id_tab) && name_tab && !seen.has(trash_id_tab)) {
      seen.add(trash_id_tab)
      profiles.push({ trash_id: trash_id_tab, name: name_tab, mediaType, group: deriveGroup(name_tab), source })
      continue
    }
    // Fallback: table format (box-drawing characters)
    const clean = trimmed.replace(/[│┌└─┐┘]/g, '').trim()
    if (!clean) continue
    const tableParts = clean.split(/\s{2,}/)
    const hexPart = tableParts.find(p => /^[0-9a-f]{32}$/i.test(p.trim()))
    if (hexPart) {
      const trash_id = hexPart.trim()
      const name = tableParts.find(p => p.trim() && !/^[0-9a-f]{32}$/i.test(p.trim()))?.trim()
      if (trash_id && name && !seen.has(trash_id)) {
        seen.add(trash_id)
        profiles.push({ trash_id, name, mediaType, group: deriveGroup(name), source })
      }
    }
  }
  return profiles
}

const CF_LINE_RE_RAW = /^\s*-\s+([0-9a-f]{32})\s+#\s+(.+)$/i

function parseCustomFormats(stdout: string, mediaType: 'radarr' | 'sonarr'): RecyclarrCf[] {
  const cfs: RecyclarrCf[] = []
  const seen = new Set<string>()
  for (const line of stdout.split('\n')) {
    // Try plain --raw format first: "  - <hash> # <name>"
    const m = CF_LINE_RE_RAW.exec(line)
    if (m) {
      const trash_id = m[1]!
      const name = m[2]!.trim()
      if (trash_id && name && !seen.has(trash_id)) {
        seen.add(trash_id)
        cfs.push({ trash_id, name, mediaType })
      }
      continue
    }
    // Fallback: table format (box-drawing chars, without --raw or older recyclarr)
    const clean = line.replace(/[│┌└─┐┘]/g, '').trim()
    if (!clean) continue
    const parts = clean.split(/\s{2,}/)
    const hexPart = parts.find(p => /^[0-9a-f]{32}$/i.test(p.trim()))
    if (hexPart) {
      const trash_id = hexPart.trim()
      const name = parts.find(p => p.trim() && !/^[0-9a-f]{32}$/i.test(p.trim()))?.trim()
      if (trash_id && name && !seen.has(trash_id)) {
        seen.add(trash_id)
        cfs.push({ trash_id, name, mediaType })
      }
    }
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
    const { stdout, exitCode } = await dockerExecInContainer(containerName, ['recyclarr', 'list', 'quality-profiles', service, '--raw'], 15_000)
    if (exitCode !== 0) throw new Error(`recyclarr list quality-profiles failed (exit ${exitCode})`)
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
    const { stdout, exitCode } = await dockerExecInContainer(containerName, ['recyclarr', 'list', 'custom-formats', service, '--raw'], 15_000)
    if (exitCode !== 0) throw new Error(`recyclarr list custom-formats failed (exit ${exitCode})`)
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

    // Collect user CF trash_ids for auto-protect in reset_unmatched_scores.except
    const userCfTids: string[] = []
    for (const ucf of cfg.userCfNames) {
      const tid = (ucf.trash_id && ucf.trash_id.trim()) ? ucf.trash_id : ucf.name
      if (tid) userCfTids.push(tid)
    }

    const qualityProfiles = cfg.profilesConfig.map(pc => {
      const entry: Record<string, unknown> = { trash_id: pc.trash_id }
      if (pc.min_format_score != null && pc.min_format_score > 0) {
        entry.min_format_score = pc.min_format_score
      }
      if (pc.reset_unmatched_scores_enabled) {
        const rusObj: Record<string, unknown> = { enabled: true }
        const allExcept = [...new Set([...pc.reset_unmatched_scores_except, ...userCfTids])]
        if (allExcept.length > 0) {
          rusObj.except = allExcept
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

    // User CFs — use trash_id (new) or fall back to name (legacy)
    for (const ucf of cfg.userCfNames) {
      const tid = (ucf.trash_id && ucf.trash_id.trim()) ? ucf.trash_id : ucf.name
      if (!tid) continue
      const score = ucf.score
      const profileTargets = ucf.profileTrashId
        ? [ucf.profileTrashId]
        : cfg.profilesConfig.map(pc => pc.trash_id)
      for (const ptid of profileTargets) {
        const key = `${ptid}::${score}`
        if (!groupedOverrides[key]) {
          groupedOverrides[key] = { trash_ids: [], profileTrashId: ptid, score }
        }
        if (!groupedOverrides[key].trash_ids.includes(tid)) {
          groupedOverrides[key].trash_ids.push(tid)
        }
      }
    }

    for (const g of Object.values(groupedOverrides)) {
      customFormats.push({
        trash_ids: g.trash_ids,
        assign_scores_to: [{ trash_id: g.profileTrashId, score: g.score }],
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
      const row = db.prepare('SELECT * FROM recyclarr_config WHERE instance_id = ?').get(instanceId) as RecyclarrConfigRow | undefined
      if (!row || !row.enabled) return
      const inUse = db.prepare('SELECT 1 FROM recyclarr_config WHERE is_syncing = 1').get()
      if (inUse) { logger.warn({ instanceId }, 'Recyclarr sync already running, skipping'); return }
      db.prepare('UPDATE recyclarr_config SET is_syncing = 1 WHERE instance_id = ?').run(instanceId)
      const { containerName } = getRecyclarrSettings()
      try {
        const { exitCode } = await dockerExecInContainer(containerName, ['recyclarr', 'sync'], 300_000)
        const success = exitCode === 0 ? 1 : 0
        db.prepare("UPDATE recyclarr_config SET is_syncing = 0, last_synced_at = datetime('now'), last_sync_success = ? WHERE instance_id = ?").run(success, instanceId)
      } catch (e) {
        db.prepare("UPDATE recyclarr_config SET is_syncing = 0, last_synced_at = datetime('now'), last_sync_success = 0 WHERE instance_id = ?").run(instanceId)
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
    const rows = db.prepare('SELECT * FROM recyclarr_config WHERE enabled = 1').all() as RecyclarrConfigRow[]
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
  // Init user CF folders and settings.yml on startup
  try {
    ensureUserCfFolders()
    writeSettingsYml()
  } catch (e) {
    app.log.warn({ err: e }, 'Could not init user CF folders or settings.yml')
  }

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
      FROM recyclarr_config rc
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
      const existing = db.prepare('SELECT id FROM recyclarr_config WHERE instance_id = ?').get(instanceId) as { id: string } | undefined

      if (existing) {
        db.prepare(`UPDATE recyclarr_config SET
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
        db.prepare(`INSERT INTO recyclarr_config
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
        const allRows = db.prepare('SELECT * FROM recyclarr_config WHERE enabled = 1').all() as RecyclarrConfigRow[]
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
    const rows = db.prepare('SELECT * FROM recyclarr_config WHERE enabled = 1').all() as RecyclarrConfigRow[]
    const insts = db.prepare('SELECT * FROM arr_instances').all() as ArrInstanceRow[]
    const configs = rows.map(rowToConfig)
    const yaml = generateRecyclarrYaml(configs, insts)
    return reply.send({ yaml })
  })

  // POST /api/recyclarr/reset
  app.post('/api/recyclarr/reset', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const db = getDb()
    db.prepare('UPDATE recyclarr_config SET enabled = 0, templates = ?, score_overrides = ?, user_cf_names = ?, preferred_ratio = 0, profiles_config = ?, sync_schedule = ?, delete_old_cfs = 0 WHERE 1=1').run(
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

  // GET /api/recyclarr/global-sync  (SSE streaming)
  app.get('/api/recyclarr/global-sync', { onRequest: [app.authenticate] }, async (req, reply) => {
    const db = getDb()
    const inUse = db.prepare('SELECT 1 FROM recyclarr_config WHERE is_syncing = 1').get()
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

    db.prepare('UPDATE recyclarr_config SET is_syncing = 1 WHERE enabled = 1').run()
    const { containerName } = getRecyclarrSettings()
    try {
      const collectedLines: string[] = []
      let exitCode = await streamingDockerExec(
        containerName,
        ['recyclarr', 'sync'],
        (stream, line) => { send(line, stream); collectedLines.push(line) },
        300_000
      )

      // Auto-adopt: if sync fails and output mentions existing CFs conflict
      if (exitCode !== 0) {
        const combined = collectedLines.join('\n')
        if (combined.includes('state repair --adopt') || combined.includes('already exist')) {
          send('Auto-adopting existing custom formats…', 'stdout')
          try {
            const adoptResult = await dockerExecInContainer(
              containerName, ['recyclarr', 'state', 'repair', '--adopt'], 60_000
            )
            const adoptOutput = (adoptResult.stdout + adoptResult.stderr).trim()
            if (adoptOutput) send(adoptOutput, 'stdout')
            if (adoptResult.exitCode === 0) {
              send('Retrying sync after adoption…', 'stdout')
              exitCode = await streamingDockerExec(
                containerName,
                ['recyclarr', 'sync'],
                (stream, line) => send(line, stream),
                300_000
              )
            }
          } catch (adoptError) {
            send(`Adoption failed: ${adoptError instanceof Error ? adoptError.message : String(adoptError)}`, 'stderr')
          }
        }
      }

      const success = exitCode === 0
      db.prepare("UPDATE recyclarr_config SET is_syncing = 0, last_synced_at = datetime('now'), last_sync_success = ? WHERE enabled = 1").run(success ? 1 : 0)
      if (success) send('Global sync completed successfully', 'done')
      else send(`Global sync failed with exit code ${exitCode}`, 'error')
    } catch (e) {
      db.prepare('UPDATE recyclarr_config SET is_syncing = 0 WHERE enabled = 1').run()
      send(e instanceof Error ? e.message : 'Sync error', 'error')
    }
    raw.end()
  })

  // GET /api/recyclarr/trash-cf-names?service=radarr|sonarr
  app.get<{ Querystring: { service?: string } }>(
    '/api/recyclarr/trash-cf-names',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const service = req.query.service as 'radarr' | 'sonarr' | undefined
      if (service !== 'radarr' && service !== 'sonarr') return reply.status(400).send({ error: 'service must be radarr or sonarr' })
      const { containerName } = getRecyclarrSettings()
      try {
        const { cfs, warning } = await getCustomFormats(service, containerName, false)
        return reply.send({ names: cfs.map(cf => cf.name), cached: false, warning: warning ? 'Container unreachable, using cached data' : undefined })
      } catch (e) {
        return reply.status(500).send({ error: e instanceof Error ? e.message : 'Failed to fetch CF names' })
      }
    }
  )

  // POST /api/recyclarr/preview-yaml/:instanceId
  app.post<{ Params: { instanceId: string }; Body: SaveConfigBody }>(
    '/api/recyclarr/preview-yaml/:instanceId',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const { instanceId } = req.params
      const db = getDb()
      const inst = db.prepare('SELECT * FROM arr_instances WHERE id = ?').get(instanceId) as ArrInstanceRow | undefined
      if (!inst) return reply.status(404).send({ error: 'Instance not found' })
      if (inst.type !== 'radarr' && inst.type !== 'sonarr') return reply.status(400).send({ error: 'Only radarr/sonarr instances supported' })
      const body = req.body
      const tempConfig: RecyclarrConfig = {
        instanceId,
        enabled: body.enabled,
        selectedProfiles: body.selectedProfiles ?? [],
        scoreOverrides: body.scoreOverrides ?? [],
        userCfNames: body.userCfNames ?? [],
        preferredRatio: body.preferredRatio ?? 0,
        profilesConfig: body.profilesConfig ?? [],
        deleteOldCfs: body.deleteOldCfs ?? false,
      }
      const yaml = generateRecyclarrYaml([tempConfig], [inst])
      return reply.send({ yaml })
    }
  )

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

  // GET /api/recyclarr/debug/cf-raw?service=radarr|sonarr
  app.get<{ Querystring: { service?: string } }>(
    '/api/recyclarr/debug/cf-raw',
    { onRequest: [app.requireAdmin] },
    async (req, reply) => {
      const service = req.query.service as 'radarr' | 'sonarr' | undefined
      if (service !== 'radarr' && service !== 'sonarr') return reply.status(400).send({ error: 'service must be radarr or sonarr' })
      const { containerName } = getRecyclarrSettings()
      try {
        const { stdout, stderr, exitCode } = await dockerExecInContainer(containerName, ['recyclarr', 'list', 'custom-formats', service, '--raw'], 15_000)
        const parsed = parseCustomFormats(stdout, service)
        return reply.send({
          stdout,
          stderr,
          exitCode,
          parsed_count: parsed.length,
          first_10_lines: stdout.split('\n').slice(0, 10),
        })
      } catch (e) {
        return reply.status(500).send({ error: e instanceof Error ? e.message : 'Failed' })
      }
    }
  )

  // POST /api/recyclarr/adopt
  app.post('/api/recyclarr/adopt', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const { containerName } = getRecyclarrSettings()
    try {
      const { exitCode, stdout, stderr } = await dockerExecInContainer(
        containerName, ['recyclarr', 'state', 'repair', '--adopt'], 60_000
      )
      return reply.send({ ok: exitCode === 0, output: stdout + stderr })
    } catch (e) {
      return reply.status(500).send({ error: e instanceof Error ? e.message : 'Adopt failed' })
    }
  })

  // ── User CF filesystem routes ───────────────────────────────────────────────

  // GET /api/recyclarr/user-cfs/:service
  app.get<{ Params: { service: string } }>(
    '/api/recyclarr/user-cfs/:service',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const service = req.params.service as 'radarr' | 'sonarr'
      if (service !== 'radarr' && service !== 'sonarr') return reply.status(400).send({ error: 'service must be radarr or sonarr' })
      try {
        return reply.send({ cfs: listUserCfs(service) })
      } catch (e) {
        return reply.status(500).send({ error: e instanceof Error ? e.message : 'Failed to list user CFs' })
      }
    }
  )

  // POST /api/recyclarr/user-cfs/:service
  app.post<{ Params: { service: string }; Body: CreateUserCfBody }>(
    '/api/recyclarr/user-cfs/:service',
    { onRequest: [app.requireAdmin] },
    async (req, reply) => {
      const service = req.params.service as 'radarr' | 'sonarr'
      if (service !== 'radarr' && service !== 'sonarr') return reply.status(400).send({ error: 'service must be radarr or sonarr' })
      const { name, specifications } = req.body
      if (!name?.trim()) return reply.status(400).send({ error: 'name is required' })
      const trashId = toUserCfSlug(name.trim())
      ensureUserCfFolders()
      const existing = listUserCfs(service)
      if (existing.some(cf => cf.trash_id === trashId)) {
        return reply.status(400).send({ error: `A user CF with trash_id "${trashId}" already exists` })
      }
      const cf: UserCfFile = {
        trash_id: trashId,
        name: name.trim(),
        includeCustomFormatWhenRenaming: false,
        specifications: specifications ?? [],
      }
      fs.writeFileSync(path.join(USER_CF_BASE, service, `${trashId}.json`), JSON.stringify(cf, null, 2), 'utf8')
      writeSettingsYml()
      return reply.status(201).send({ cf })
    }
  )

  // PUT /api/recyclarr/user-cfs/:service/:trashId
  app.put<{ Params: { service: string; trashId: string }; Body: UpdateUserCfBody }>(
    '/api/recyclarr/user-cfs/:service/:trashId',
    { onRequest: [app.requireAdmin] },
    async (req, reply) => {
      const service = req.params.service as 'radarr' | 'sonarr'
      if (service !== 'radarr' && service !== 'sonarr') return reply.status(400).send({ error: 'service must be radarr or sonarr' })
      const { trashId } = req.params
      const { name, specifications } = req.body
      if (!name?.trim()) return reply.status(400).send({ error: 'name is required' })
      const filePath = path.join(USER_CF_BASE, service, `${trashId}.json`)
      if (!fs.existsSync(filePath)) return reply.status(404).send({ error: 'CF not found' })
      const cf: UserCfFile = {
        trash_id: trashId,
        name: name.trim(),
        includeCustomFormatWhenRenaming: false,
        specifications: specifications ?? [],
      }
      fs.writeFileSync(filePath, JSON.stringify(cf, null, 2), 'utf8')
      return reply.send({ cf })
    }
  )

  // DELETE /api/recyclarr/user-cfs/:service/:trashId
  app.delete<{ Params: { service: string; trashId: string } }>(
    '/api/recyclarr/user-cfs/:service/:trashId',
    { onRequest: [app.requireAdmin] },
    async (req, reply) => {
      const service = req.params.service as 'radarr' | 'sonarr'
      if (service !== 'radarr' && service !== 'sonarr') return reply.status(400).send({ error: 'service must be radarr or sonarr' })
      const { trashId } = req.params
      const filePath = path.join(USER_CF_BASE, service, `${trashId}.json`)
      if (!fs.existsSync(filePath)) return reply.status(404).send({ error: 'CF not found' })
      fs.unlinkSync(filePath)
      writeSettingsYml()
      // Remove references from recyclarr_config in DB
      const db = getDb()
      const rows = db.prepare('SELECT id, user_cf_names FROM recyclarr_config').all() as { id: string; user_cf_names: string }[]
      for (const row of rows) {
        const names = safeJson<UserCf[]>(row.user_cf_names, [])
        const updated = names.filter(ucf => ucf.trash_id !== trashId && ucf.name !== trashId)
        if (updated.length !== names.length) {
          db.prepare("UPDATE recyclarr_config SET user_cf_names = ?, updated_at = datetime('now') WHERE id = ?")
            .run(JSON.stringify(updated), row.id)
        }
      }
      // Regenerate YAML
      try {
        const allRows = db.prepare('SELECT * FROM recyclarr_config WHERE enabled = 1').all() as RecyclarrConfigRow[]
        const allInsts = db.prepare('SELECT * FROM arr_instances').all() as ArrInstanceRow[]
        await writeYaml(allRows.map(rowToConfig), allInsts)
      } catch (e) {
        app.log.warn({ err: e }, 'Failed to write recyclarr YAML after user CF delete')
      }
      return reply.send({ ok: true })
    }
  )
}
