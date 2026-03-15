import { FastifyInstance } from 'fastify'
import { nanoid } from 'nanoid'
import { getDb } from '../db/database'
import { stringify, parse as parseYaml } from 'yaml'
import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'
import { fetch } from 'undici'
import * as cron from 'node-cron'

const RECYCLARR_CONFIG_PATH = process.env.RECYCLARR_CONFIG_PATH ?? '/recyclarr/recyclarr.yml'
const RECYCLARR_CONTAINER_NAME = process.env.RECYCLARR_CONTAINER_NAME ?? 'recyclarr'

const GITHUB_INCLUDES_URL = 'https://raw.githubusercontent.com/recyclarr/config-templates/master/includes.json'
const TEMPLATES_CACHE_KEY = 'recyclarr_templates_cache'
const TEMPLATES_FETCHED_AT_KEY = 'recyclarr_templates_fetched_at'
const TEMPLATES_CACHE_TTL = 24 * 60 * 60 * 1000 // 24h

const IMPORT_WARNING_KEY = 'recyclarr_yaml_import_warning'
const IMPORT_ATTEMPTED_KEY = 'recyclarr_yaml_import_attempted'

// ─── Template types ─────────────────────────────────────────────────────────

interface RecyclarrTemplate {
  slug: string
  name: string
  type: 'profile' | 'custom_formats' | 'quality_definition'
  mediaType: 'radarr' | 'sonarr'
  pairedWith?: string
  group: string
}

// ─── Template fetch + cache ──────────────────────────────────────────────────

function getSettingStr(key: string): string | null {
  const db = getDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  if (!row) return null
  try { return JSON.parse(row.value) as string } catch { return row.value }
}

function setSettingStr(key: string, value: string): void {
  const db = getDb()
  db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(key, JSON.stringify(value))
}

function delSetting(key: string): void {
  const db = getDb()
  db.prepare('DELETE FROM settings WHERE key = ?').run(key)
}

function deriveType(template: string): 'profile' | 'custom_formats' | 'quality_definition' | null {
  if (template.includes('/quality-profiles/')) return 'profile'
  if (template.includes('/custom-formats/')) return 'custom_formats'
  if (template.includes('/quality-definitions/')) return 'quality_definition'
  return null
}

function deriveGroup(slug: string): string {
  if (slug.includes('german')) return 'Deutsch (German)'
  if (slug.includes('anime')) return 'Anime'
  if (slug.includes('french')) return 'French'
  if (slug.includes('dutch')) return 'Dutch'
  return 'Standard'
}

function deriveDisplayName(slug: string): string {
  let name = slug
  const prefixes = [
    'radarr-quality-profile-', 'sonarr-v4-quality-profile-',
    'radarr-custom-formats-', 'sonarr-v4-custom-formats-',
    'radarr-quality-definition-', 'sonarr-quality-definition-',
    'sonarr-quality-profile-',
  ]
  for (const prefix of prefixes) {
    if (name.startsWith(prefix)) {
      name = name.slice(prefix.length)
      break
    }
  }

  name = name.replace(/-/g, ' ')
  name = name.replace(/\b\w/g, c => c.toUpperCase())

  const replacements: [RegExp, string][] = [
    [/\bUhd\b/g, 'UHD'],
    [/\bHd\b/g, 'HD'],
    [/\bWeb\b/g, 'WEB'],
    [/\bBluray\b/g, 'Bluray'],
    [/\bRemux\b/g, 'Remux'],
    [/\bV4\b/g, ''],
    [/\bGerman\b/g, '(German)'],
    [/\bAnime\b/g, 'Anime'],
    [/\bSonarr\b/g, ''],
    [/\bRadarr\b/g, ''],
    [/\bMovie\b/g, 'Movie'],
    [/\bSeries\b/g, 'Series'],
  ]
  for (const [pattern, replacement] of replacements) {
    name = name.replace(pattern, replacement)
  }
  return name.replace(/\s+/g, ' ').trim()
}

interface IncludesJsonEntry {
  template: string
  id: string
}

interface IncludesJson {
  radarr?: unknown[]
  sonarr?: unknown[]
}

function parseIncludesJson(raw: unknown): RecyclarrTemplate[] {
  if (!raw || typeof raw !== 'object') return []
  const obj = raw as IncludesJson
  const templates: RecyclarrTemplate[] = []
  const groups: Array<{ mediaType: 'radarr' | 'sonarr'; entries: IncludesJsonEntry[] }> = []

  for (const mt of ['radarr', 'sonarr'] as const) {
    const arr = (obj as Record<string, unknown>)[mt]
    if (!Array.isArray(arr)) continue
    const entries: IncludesJsonEntry[] = []
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue
      const entry = item as Record<string, unknown>
      if (typeof entry.template !== 'string' || typeof entry.id !== 'string') continue
      const type = deriveType(entry.template)
      if (!type) {
        console.warn(`[recyclarr] unknown template type: ${entry.template} — skipping`)
        continue
      }
      entries.push({ template: entry.template, id: entry.id })
    }
    groups.push({ mediaType: mt, entries })
  }

  // Build profile→CF pairing map
  for (const { mediaType, entries } of groups) {
    for (const entry of entries) {
      const type = deriveType(entry.template)!
      const pairedWith = type === 'profile'
        ? entry.id.replace('quality-profile-', 'custom-formats-')
        : null
      // Verify CF exists
      const resolvedPair = pairedWith && entries.some(e => e.id === pairedWith) ? pairedWith : null

      const tpl: RecyclarrTemplate = {
        slug: entry.id,
        name: deriveDisplayName(entry.id),
        type,
        mediaType,
        group: deriveGroup(entry.id),
      }
      if (resolvedPair) tpl.pairedWith = resolvedPair
      templates.push(tpl)
    }
  }

  return templates
}

async function fetchTemplatesFromGitHub(): Promise<{ templates: RecyclarrTemplate[]; warning?: string }> {
  try {
    const resp = await fetch(GITHUB_INCLUDES_URL, {
      headers: { 'User-Agent': 'heldash/1.0' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!resp.ok) throw new Error(`GitHub returned ${resp.status}`)
    const raw = await resp.json()
    const templates = parseIncludesJson(raw)
    return { templates }
  } catch (e) {
    return { templates: [], warning: e instanceof Error ? e.message : String(e) }
  }
}

async function getTemplates(forceRefresh = false): Promise<{ templates: RecyclarrTemplate[]; lastFetchedAt: string | null; warning: boolean }> {
  const cachedJson = getSettingStr(TEMPLATES_CACHE_KEY)
  const fetchedAt = getSettingStr(TEMPLATES_FETCHED_AT_KEY)
  const age = fetchedAt ? Date.now() - new Date(fetchedAt).getTime() : Infinity

  if (!forceRefresh && cachedJson && age < TEMPLATES_CACHE_TTL) {
    try {
      const templates = JSON.parse(cachedJson) as RecyclarrTemplate[]
      return { templates, lastFetchedAt: fetchedAt, warning: false }
    } catch { /* fall through to refresh */ }
  }

  const { templates, warning } = await fetchTemplatesFromGitHub()

  if (templates.length > 0) {
    const now = new Date().toISOString()
    setSettingStr(TEMPLATES_CACHE_KEY, JSON.stringify(templates))
    setSettingStr(TEMPLATES_FETCHED_AT_KEY, now)
    return { templates, lastFetchedAt: now, warning: false }
  }

  // GitHub failed — return cached if available
  if (cachedJson) {
    try {
      const templates = JSON.parse(cachedJson) as RecyclarrTemplate[]
      return { templates, lastFetchedAt: fetchedAt, warning: true }
    } catch { /* fall through */ }
  }

  return { templates: [], lastFetchedAt: null, warning: !!warning }
}

// ─── DB row types ────────────────────────────────────────────────────────────

interface ProfileConfig {
  slug: string
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
  profileName: string
}

interface UserCf {
  name: string
  score: number
  profileName: string
}

interface SaveConfigBody {
  enabled: boolean
  templates: string[]
  scoreOverrides: ScoreOverride[]
  userCfNames: UserCf[]
  preferredRatio: number
  profilesConfig: ProfileConfig[]
  syncSchedule: string
  deleteOldCfs: boolean
}

// ─── TRaSH CF cache ──────────────────────────────────────────────────────────

interface CfEntry {
  trash_id: string
  name: string
  defaultScore: number
  profileName: string
}

const cfCache: Map<string, { entries: CfEntry[]; fetchedAt: number }> = new Map()
const CF_CACHE_TTL = 24 * 60 * 60 * 1000 // 24h

function getCacheDir(): string {
  return path.dirname(RECYCLARR_CONFIG_PATH)
}

function getCacheFilePath(): string {
  return path.join(getCacheDir(), 'trash_cache.json')
}

function loadCacheFromDisk(): Record<string, { entries: CfEntry[]; fetchedAt: number }> {
  try {
    const raw = fs.readFileSync(getCacheFilePath(), 'utf8')
    return JSON.parse(raw) as Record<string, { entries: CfEntry[]; fetchedAt: number }>
  } catch {
    return {}
  }
}

function saveCacheToDisk(): void {
  try {
    const obj: Record<string, { entries: CfEntry[]; fetchedAt: number }> = {}
    for (const [k, v] of cfCache.entries()) {
      obj[k] = v
    }
    const dir = getCacheDir()
    if (!fs.existsSync(dir)) return
    fs.writeFileSync(getCacheFilePath(), JSON.stringify(obj), 'utf8')
  } catch {
    // ignore write errors (dir may not exist)
  }
}

// Load disk cache into memory on module load
{
  const disk = loadCacheFromDisk()
  for (const [k, v] of Object.entries(disk)) {
    cfCache.set(k, v)
  }
}

// TRaSH Guides GitHub paths for CF JSON files per template
const TEMPLATE_CF_PATHS: Record<string, { mediaType: string; profileName: string }> = {
  'radarr-custom-formats-hd-bluray-web': { mediaType: 'radarr', profileName: 'HD Bluray + WEB' },
  'radarr-custom-formats-uhd-bluray-web': { mediaType: 'radarr', profileName: 'UHD Bluray + WEB' },
  'radarr-custom-formats-remux-web-1080p': { mediaType: 'radarr', profileName: 'Remux + WEB 1080p' },
  'radarr-custom-formats-remux-web-2160p': { mediaType: 'radarr', profileName: 'Remux + WEB 2160p' },
  'sonarr-custom-formats-web-1080p': { mediaType: 'sonarr', profileName: 'WEB 1080p' },
  'sonarr-v4-custom-formats-web-1080p': { mediaType: 'sonarr', profileName: 'WEB 1080p' },
  'sonarr-custom-formats-web-2160p': { mediaType: 'sonarr', profileName: 'WEB 2160p' },
  'sonarr-v4-custom-formats-web-2160p': { mediaType: 'sonarr', profileName: 'WEB 2160p' },
  'sonarr-custom-formats-anime': { mediaType: 'sonarr', profileName: 'Anime' },
  'sonarr-v4-custom-formats-anime-sonarr': { mediaType: 'sonarr', profileName: 'Anime' },
}

async function fetchCfListForTemplate(templateSlug: string, forceRefresh = false): Promise<CfEntry[]> {
  const cached = cfCache.get(templateSlug)
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < CF_CACHE_TTL) {
    return cached.entries
  }

  const meta = TEMPLATE_CF_PATHS[templateSlug]
  if (!meta) return []

  try {
    const treeResp = await fetch('https://api.github.com/repos/TRaSH-Guides/Guides/git/trees/master?recursive=1', {
      headers: { 'User-Agent': 'heldash/1.0', Accept: 'application/vnd.github.v3+json' },
    })
    if (!treeResp.ok) return []

    interface GitHubTreeItem { path: string; type: string; url: string }
    interface GitHubTree { tree: GitHubTreeItem[] }
    const tree = await treeResp.json() as GitHubTree

    // Find CF JSON files for this media type
    const cfDir = meta.mediaType === 'radarr' ? 'docs/json/radarr/cf' : 'docs/json/sonarr/cf'
    const cfFiles = tree.tree.filter(
      (item: GitHubTreeItem) => item.type === 'blob' && item.path.startsWith(cfDir) && item.path.endsWith('.json')
    )

    // Fetch each CF file and extract name + trash_id
    const entries: CfEntry[] = []
    const batchSize = 10
    for (let i = 0; i < cfFiles.length; i += batchSize) {
      const batch = cfFiles.slice(i, i + batchSize)
      await Promise.all(batch.map(async (item: GitHubTreeItem) => {
        try {
          const rawUrl = `https://raw.githubusercontent.com/TRaSH-Guides/Guides/master/${item.path}`
          const resp = await fetch(rawUrl, { headers: { 'User-Agent': 'heldash/1.0' } })
          if (!resp.ok) return
          interface CfJson { name?: string; trash_id?: string; trash_scores?: Record<string, number> }
          const cf = await resp.json() as CfJson
          if (cf.name && cf.trash_id) {
            const defaultScore = cf.trash_scores?.[meta.profileName] ?? 0
            entries.push({ trash_id: cf.trash_id, name: cf.name, defaultScore, profileName: meta.profileName })
          }
        } catch { /* skip */ }
      }))
    }

    cfCache.set(templateSlug, { entries, fetchedAt: Date.now() })
    saveCacheToDisk()
    return entries
  } catch {
    return cached?.entries ?? []
  }
}

// ─── Cron scheduler ──────────────────────────────────────────────────────────

interface SimpleLogger {
  info: (obj: object, msg?: string) => void
  warn: (obj: object, msg?: string) => void
  error: (obj: object, msg?: string) => void
}

const scheduledTasks: Map<string, cron.ScheduledTask> = new Map()

async function runRecyclarrSync(instanceId: string, log: SimpleLogger): Promise<void> {
  const db = getDb()
  // Guard: skip if already syncing
  const row = db.prepare('SELECT is_syncing FROM recyclarr_config WHERE instance_id = ?').get(instanceId) as { is_syncing: number } | undefined
  if (row?.is_syncing === 1) {
    log.warn({ instanceId }, 'recyclarr: sync already in progress — skipping scheduled run')
    return
  }
  try {
    db.prepare("UPDATE recyclarr_config SET is_syncing = 1 WHERE instance_id = ?").run(instanceId)
    const args = ['exec', RECYCLARR_CONTAINER_NAME, 'recyclarr', 'sync', '--instance', instanceId]
    const proc = spawn('docker', args)
    await new Promise<void>(resolve => {
      proc.on('close', code => {
        const now = new Date().toISOString()
        const success = code === 0 ? 1 : 0
        try {
          db.prepare("UPDATE recyclarr_config SET last_synced_at = ?, last_sync_success = ?, is_syncing = 0 WHERE instance_id = ?")
            .run(now, success, instanceId)
        } catch (e) {
          log.warn({ err: e }, 'recyclarr: could not update last_synced_at')
        }
        resolve()
      })
      proc.on('error', err => {
        log.error({ err, instanceId }, 'recyclarr: scheduled sync spawn error')
        try {
          db.prepare("UPDATE recyclarr_config SET is_syncing = 0 WHERE instance_id = ?").run(instanceId)
        } catch { /* ignore */ }
        resolve()
      })
    })
  } finally {
    try {
      db.prepare("UPDATE recyclarr_config SET is_syncing = 0 WHERE instance_id = ?").run(instanceId)
    } catch { /* ignore */ }
  }
}

export function scheduleRecyclarrSync(instanceId: string, schedule: string, log: SimpleLogger): void {
  const existing = scheduledTasks.get(instanceId)
  if (existing) {
    existing.stop()
    scheduledTasks.delete(instanceId)
  }
  if (schedule === 'manual') return
  if (!cron.validate(schedule)) {
    log.warn({ instanceId, schedule }, 'recyclarr: invalid cron expression — scheduler not started')
    return
  }
  const task = cron.schedule(schedule, () => {
    log.info({ instanceId }, 'recyclarr: scheduled sync triggered')
    runRecyclarrSync(instanceId, log).catch(e => {
      log.error({ err: e, instanceId }, 'recyclarr: scheduled sync failed')
    })
  })
  scheduledTasks.set(instanceId, task)
}

export function initRecyclarrSchedulers(log: SimpleLogger): void {
  const db = getDb()
  interface ScheduleRow { instance_id: string; sync_schedule: string }
  const rows = db.prepare(
    "SELECT instance_id, sync_schedule FROM recyclarr_config WHERE sync_schedule != 'manual' AND enabled = 1"
  ).all() as ScheduleRow[]
  for (const row of rows) {
    scheduleRecyclarrSync(row.instance_id, row.sync_schedule, log)
  }
}

// ─── YAML import ─────────────────────────────────────────────────────────────

interface ImportedInstanceConfig {
  instanceId: string
  templates: string[]
  preferredRatio: number
  profilesConfig: ProfileConfig[]
  scoreOverrides: ScoreOverride[]
  userCfNames: UserCf[]
  deleteOldCfs: boolean
}

function findInstanceForYamlKey(key: string, type: 'radarr' | 'sonarr', instances: ArrInstanceRow[]): ArrInstanceRow | undefined {
  const typed = instances.filter(i => i.type === type)
  return typed.find(i => i.id === key) ?? typed.find(i => i.name === key) ?? (typed.length === 1 ? typed[0] : undefined)
}

function importYamlConfig(yamlContent: string, instances: ArrInstanceRow[]): ImportedInstanceConfig[] {
  const doc = parseYaml(yamlContent) as Record<string, unknown>
  const results: ImportedInstanceConfig[] = []

  for (const mediaType of ['radarr', 'sonarr'] as const) {
    const section = doc[mediaType]
    if (!section || typeof section !== 'object') continue

    for (const [key, value] of Object.entries(section as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const instanceConfig = value as Record<string, unknown>

      const inst = findInstanceForYamlKey(key, mediaType, instances)
      if (!inst) continue

      // Extract templates from include[]
      const templates: string[] = []
      const include = instanceConfig.include
      if (Array.isArray(include)) {
        for (const item of include) {
          if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).template === 'string') {
            templates.push((item as Record<string, unknown>).template as string)
          }
        }
      }

      // Extract preferred_ratio from quality_definition
      let preferredRatio = 0.0
      const qd = instanceConfig.quality_definition
      if (qd && typeof qd === 'object') {
        const qdObj = qd as Record<string, unknown>
        if (typeof qdObj.preferred_ratio === 'number') {
          preferredRatio = qdObj.preferred_ratio
        }
      }

      // Extract profiles_config from quality_profiles
      const profilesConfig: ProfileConfig[] = []
      const qp = instanceConfig.quality_profiles
      if (Array.isArray(qp)) {
        for (const profile of qp) {
          if (!profile || typeof profile !== 'object') continue
          const p = profile as Record<string, unknown>
          const profileName = typeof p.name === 'string' ? p.name : null
          if (!profileName) continue
          // Match profile name to template slug via display name
          const matchedSlug = templates.find(t => deriveDisplayName(t) === profileName) ?? profileName
          const pc: ProfileConfig = {
            slug: matchedSlug,
            reset_unmatched_scores_enabled: true,
            reset_unmatched_scores_except: [],
          }
          if (typeof p.min_format_score === 'number') {
            pc.min_format_score = p.min_format_score
          }
          const rus = p.reset_unmatched_scores
          if (rus && typeof rus === 'object') {
            const rusObj = rus as Record<string, unknown>
            if (typeof rusObj.enabled === 'boolean') {
              pc.reset_unmatched_scores_enabled = rusObj.enabled
            }
            if (Array.isArray(rusObj.except)) {
              pc.reset_unmatched_scores_except = rusObj.except.filter((e): e is string => typeof e === 'string')
            }
          }
          profilesConfig.push(pc)
        }
      }

      // Extract score_overrides and user_cf_names from custom_formats
      const scoreOverrides: ScoreOverride[] = []
      const userCfNames: UserCf[] = []
      const cf = instanceConfig.custom_formats
      if (Array.isArray(cf)) {
        for (const entry of cf) {
          if (!entry || typeof entry !== 'object') continue
          const e = entry as Record<string, unknown>
          const trashIds = Array.isArray(e.trash_ids) ? e.trash_ids.filter((t): t is string => typeof t === 'string') : []
          const assignScores = Array.isArray(e.assign_scores) ? e.assign_scores : []
          for (const tid of trashIds) {
            const isTrashId = /^[0-9a-f]{24,40}$/i.test(tid)
            for (const as_ of assignScores) {
              if (!as_ || typeof as_ !== 'object') continue
              const asObj = as_ as Record<string, unknown>
              const profileNameVal = typeof asObj.name === 'string' ? asObj.name : ''
              const score = typeof asObj.score === 'number' ? asObj.score : 0
              if (isTrashId) {
                scoreOverrides.push({ trash_id: tid, name: tid, score, profileName: profileNameVal })
              } else {
                userCfNames.push({ name: tid, score, profileName: profileNameVal })
              }
            }
          }
        }
      }

      // Extract delete_old_custom_formats
      const deleteOldCfs = instanceConfig.delete_old_custom_formats === true

      results.push({ instanceId: inst.id, templates, preferredRatio, profilesConfig, scoreOverrides, userCfNames, deleteOldCfs })
    }
  }

  return results
}

// ─── YAML generation ─────────────────────────────────────────────────────────

interface RecyclarrConfig {
  instanceId: string
  enabled: boolean
  templates: string[]
  scoreOverrides: ScoreOverride[]
  userCfNames: UserCf[]
  preferredRatio: number
  profilesConfig: ProfileConfig[]
  deleteOldCfs: boolean
}

function deriveQdType(instType: string, templates: string[]): string {
  if (instType === 'radarr') return 'movie'
  if (templates.some(t => t.includes('anime'))) return 'anime'
  return 'series'
}

function generateRecyclarrYaml(configs: RecyclarrConfig[], instances: ArrInstanceRow[]): string {
  const radarr: Record<string, unknown> = {}
  const sonarr: Record<string, unknown> = {}

  for (const cfg of configs) {
    if (!cfg.enabled) continue
    const inst = instances.find(i => i.id === cfg.instanceId)
    if (!inst) continue
    if (inst.type !== 'radarr' && inst.type !== 'sonarr') continue

    // Separate templates into profile, CF, and quality definition
    const profileSlugs = cfg.templates.filter(t => t.includes('quality-profile'))
    const cfSlugs = cfg.templates.filter(t => t.includes('custom-formats'))
    const qdSlugs = cfg.templates.filter(t => t.includes('quality-definition'))

    // Build include list: QD first, then profile+CF pairs
    const include: { template: string }[] = []
    for (const slug of qdSlugs) {
      include.push({ template: slug })
    }
    for (const slug of profileSlugs) {
      include.push({ template: slug })
      // Add paired CF template if it exists in selected templates
      const pairedCfSlug = slug.replace('quality-profile', 'custom-formats')
      if (cfSlugs.includes(pairedCfSlug)) {
        include.push({ template: pairedCfSlug })
      }
    }
    // Add any CF slugs not already added via pairing
    for (const slug of cfSlugs) {
      const pairedProfileSlug = slug.replace('custom-formats', 'quality-profile')
      if (!profileSlugs.includes(pairedProfileSlug)) {
        include.push({ template: slug })
      }
    }

    // Quality profiles section — only for profile templates (not CF or QD)
    const qualityProfiles: unknown[] = []
    for (const pc of cfg.profilesConfig) {
      // Only include if it's a profile template slug
      if (!profileSlugs.includes(pc.slug)) continue
      const profileName = deriveDisplayName(pc.slug)
      const entry: Record<string, unknown> = { name: profileName }
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
      qualityProfiles.push(entry)
    }

    // Custom formats section — score overrides + user CFs
    const customFormats: unknown[] = []

    // Group score overrides by profileName + score
    const groupedOverrides: Record<string, { trash_ids: string[]; profileName: string; score: number }> = {}
    for (const o of cfg.scoreOverrides) {
      const key = `${o.profileName}__${o.score}`
      if (!groupedOverrides[key]) {
        groupedOverrides[key] = { trash_ids: [], profileName: o.profileName, score: o.score }
      }
      groupedOverrides[key].trash_ids.push(o.trash_id)
    }
    for (const g of Object.values(groupedOverrides)) {
      customFormats.push({
        trash_ids: g.trash_ids,
        assign_scores_to: [{ name: g.profileName, score: g.score }],
      })
    }

    // User custom formats
    for (const ucf of cfg.userCfNames) {
      customFormats.push({
        trash_ids: [ucf.name],
        assign_scores_to: [{ name: ucf.profileName, score: ucf.score }],
      })
    }

    const instanceKey = inst.name.replace(/\s+/g, '-')
    const instanceConfig: Record<string, unknown> = {
      base_url: inst.url,
      api_key: inst.api_key,
      include,
    }

    if (qualityProfiles.length > 0) instanceConfig.quality_profiles = qualityProfiles
    if (customFormats.length > 0) instanceConfig.custom_formats = customFormats

    if (inst.type === 'radarr') radarr[instanceKey] = instanceConfig
    else sonarr[instanceKey] = instanceConfig
  }

  const doc: Record<string, unknown> = {}
  if (Object.keys(radarr).length > 0) doc.radarr = radarr
  if (Object.keys(sonarr).length > 0) doc.sonarr = sonarr

  return stringify(doc)
}

async function writeYaml(configs: RecyclarrConfig[], instances: ArrInstanceRow[]): Promise<void> {
  const yaml = generateRecyclarrYaml(configs, instances)
  const dir = path.dirname(RECYCLARR_CONFIG_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(RECYCLARR_CONFIG_PATH, yaml, 'utf8')
}

// ─── Profile JSON fetch ────────────────────────────────────────────────────────

interface TRaSHProfileCf {
  trash_id: string
  score: number
}

interface TRaSHProfileJson {
  trash_id?: string
  name?: string
  custom_formats?: TRaSHProfileCf[]
}

async function fetchProfileCfsFromTRaSH(
  profileSlug: string,
  mediaType: 'radarr' | 'sonarr',
  forceRefresh = false
): Promise<{ cfs: TRaSHProfileCf[]; profileName: string }> {
  const cacheKey = `profile_cfs__${profileSlug}`
  const cached = cfCache.get(cacheKey)
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < CF_CACHE_TTL) {
    const profileName = cached.entries[0]?.profileName ?? profileSlug
    return { cfs: cached.entries.map(e => ({ trash_id: e.trash_id, score: e.defaultScore })), profileName }
  }

  const baseDir = mediaType === 'radarr'
    ? 'docs/json/radarr/quality-profiles'
    : 'docs/json/sonarr/quality-profiles'
  const url = `https://raw.githubusercontent.com/TRaSH-Guides/Guides/master/${baseDir}/${profileSlug}.json`

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'heldash/1.0' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!resp.ok) return { cfs: [], profileName: profileSlug }
    const json = await resp.json() as TRaSHProfileJson
    const profileName = json.name ?? profileSlug
    const cfs = Array.isArray(json.custom_formats) ? json.custom_formats : []
    // Store in cache as CfEntry array
    const entries: CfEntry[] = cfs.map(cf => ({
      trash_id: cf.trash_id,
      name: cf.trash_id, // name will be resolved from CF cache separately
      defaultScore: cf.score,
      profileName,
    }))
    cfCache.set(cacheKey, { entries, fetchedAt: Date.now() })
    saveCacheToDisk()
    return { cfs, profileName }
  } catch {
    if (cached) {
      const profileName = cached.entries[0]?.profileName ?? profileSlug
      return { cfs: cached.entries.map(e => ({ trash_id: e.trash_id, score: e.defaultScore })), profileName }
    }
    return { cfs: [], profileName: profileSlug }
  }
}

// Fetch CF name by trash_id from TRaSH cache
const trashIdToNameCache: Map<string, string> = new Map()

async function resolveTrashIdNames(
  trashIds: string[],
  mediaType: 'radarr' | 'sonarr'
): Promise<Map<string, string>> {
  const unresolved = trashIds.filter(id => !trashIdToNameCache.has(id))
  if (unresolved.length === 0) {
    const result = new Map<string, string>()
    for (const id of trashIds) result.set(id, trashIdToNameCache.get(id) ?? id)
    return result
  }

  // Fetch CF list from TRaSH for the media type to resolve names
  const cfDir = mediaType === 'radarr' ? 'docs/json/radarr/cf' : 'docs/json/sonarr/cf'
  try {
    const treeResp = await fetch('https://api.github.com/repos/TRaSH-Guides/Guides/git/trees/master?recursive=1', {
      headers: { 'User-Agent': 'heldash/1.0', Accept: 'application/vnd.github.v3+json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!treeResp.ok) {
      const result = new Map<string, string>()
      for (const id of trashIds) result.set(id, trashIdToNameCache.get(id) ?? id)
      return result
    }
    interface GitTreeItem { path: string; type: string }
    interface GitTree { tree: GitTreeItem[] }
    const tree = await treeResp.json() as GitTree
    const cfFiles = tree.tree.filter(
      (item: GitTreeItem) => item.type === 'blob' && item.path.startsWith(cfDir) && item.path.endsWith('.json')
    )
    // Batch fetch to resolve names
    await Promise.all(cfFiles.slice(0, 200).map(async (item: GitTreeItem) => {
      try {
        const rawUrl = `https://raw.githubusercontent.com/TRaSH-Guides/Guides/master/${item.path}`
        const resp = await fetch(rawUrl, { headers: { 'User-Agent': 'heldash/1.0' }, signal: AbortSignal.timeout(8_000) })
        if (!resp.ok) return
        interface CfJson { name?: string; trash_id?: string }
        const cf = await resp.json() as CfJson
        if (cf.name && cf.trash_id) {
          trashIdToNameCache.set(cf.trash_id, cf.name)
        }
      } catch { /* skip */ }
    }))
  } catch { /* ignore */ }

  const result = new Map<string, string>()
  for (const id of trashIds) result.set(id, trashIdToNameCache.get(id) ?? id)
  return result
}

// ─── Helper: map DB row to API response object ────────────────────────────────

function rowToConfig(row: RecyclarrConfigRow, instances: ArrInstanceRow[]) {
  const inst = instances.find(i => i.id === row.instance_id)
  return {
    instanceId: row.instance_id,
    instanceName: inst?.name ?? row.instance_id,
    instanceType: (inst?.type ?? 'radarr') as 'radarr' | 'sonarr',
    enabled: row.enabled === 1,
    templates: JSON.parse(row.templates) as string[],
    scoreOverrides: JSON.parse(row.score_overrides) as ScoreOverride[],
    userCfNames: JSON.parse(row.user_cf_names) as UserCf[],
    preferredRatio: row.preferred_ratio ?? 0.0,
    profilesConfig: JSON.parse(row.profiles_config ?? '[]') as ProfileConfig[],
    syncSchedule: row.sync_schedule ?? 'manual',
    lastSyncedAt: row.last_synced_at ?? null,
    lastSyncSuccess: row.last_sync_success == null ? null : row.last_sync_success === 1,
    deleteOldCfs: row.delete_old_cfs === 1,
    isSyncing: row.is_syncing === 1,
  }
}

// ─── Route plugin ─────────────────────────────────────────────────────────────

export default async function recyclarrRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/recyclarr/templates — public
  app.get('/api/recyclarr/templates', async (_req, reply) => {
    const result = await getTemplates()
    return reply.send(result)
  })

  // POST /api/recyclarr/refresh-templates — requireAdmin
  app.post(
    '/api/recyclarr/refresh-templates',
    { onRequest: [app.requireAdmin] },
    async (_req, reply) => {
      const result = await getTemplates(true)
      return reply.send({
        updated: true,
        count: result.templates.length,
        fetched_at: result.lastFetchedAt ?? new Date().toISOString(),
        warning: result.warning ? 'GitHub unavailable — using cached templates' : undefined,
      })
    }
  )

  // GET /api/recyclarr/config — authenticate
  // One-time import of existing recyclarr.yml if table is empty
  app.get('/api/recyclarr/config', { onRequest: [app.authenticate] }, async (_req, reply) => {
    const db = getDb()
    const instances = db.prepare('SELECT id, name, type, url, api_key FROM arr_instances').all() as ArrInstanceRow[]

    // One-time YAML import if table is empty and file exists
    const importAttempted = getSettingStr(IMPORT_ATTEMPTED_KEY)
    if (!importAttempted) {
      const count = (db.prepare('SELECT COUNT(*) as c FROM recyclarr_config').get() as { c: number }).c
      if (count === 0 && fs.existsSync(RECYCLARR_CONFIG_PATH)) {
        setSettingStr(IMPORT_ATTEMPTED_KEY, 'true')
        try {
          const yamlContent = fs.readFileSync(RECYCLARR_CONFIG_PATH, 'utf8')
          const imported = importYamlConfig(yamlContent, instances)
          if (imported.length > 0) {
            for (const cfg of imported) {
              db.prepare(`
                INSERT OR IGNORE INTO recyclarr_config
                  (id, instance_id, enabled, templates, score_overrides, user_cf_names, preferred_ratio, profiles_config, sync_schedule, delete_old_cfs)
                VALUES (?, ?, 1, ?, ?, ?, ?, ?, 'manual', ?)
              `).run(
                nanoid(),
                cfg.instanceId,
                JSON.stringify(cfg.templates),
                JSON.stringify(cfg.scoreOverrides),
                JSON.stringify(cfg.userCfNames),
                cfg.preferredRatio,
                JSON.stringify(cfg.profilesConfig),
                cfg.deleteOldCfs ? 1 : 0,
              )
            }
            app.log.info({ count: imported.length }, 'recyclarr: imported existing recyclarr.yml')
          } else {
            app.log.warn('recyclarr: YAML file found but no matching instances — skipping import')
            setSettingStr(IMPORT_WARNING_KEY, 'true')
          }
        } catch (e) {
          app.log.warn({ err: e }, 'recyclarr: could not import existing recyclarr.yml')
          setSettingStr(IMPORT_WARNING_KEY, 'true')
        }
      }
    }

    const rows = db.prepare('SELECT * FROM recyclarr_config').all() as RecyclarrConfigRow[]
    const configs = rows.map(row => rowToConfig(row, instances))
    const importWarning = getSettingStr(IMPORT_WARNING_KEY) === 'true'
      ? 'Bestehende recyclarr.yml konnte nicht importiert werden — bitte Einstellungen manuell übertragen'
      : undefined

    return reply.send({ configs, importWarning })
  })

  // PUT /api/recyclarr/config/:instanceId — requireAdmin
  app.put<{ Params: { instanceId: string }; Body: SaveConfigBody }>(
    '/api/recyclarr/config/:instanceId',
    { onRequest: [app.requireAdmin] },
    async (req, reply) => {
      const db = getDb()
      const { instanceId } = req.params
      const { enabled, templates, scoreOverrides, userCfNames, preferredRatio, profilesConfig, syncSchedule, deleteOldCfs } = req.body

      // Validate cron expression if not manual
      if (syncSchedule && syncSchedule !== 'manual' && !cron.validate(syncSchedule)) {
        return reply.status(400).send({ error: 'Invalid cron expression' })
      }

      const effectiveRatio = typeof preferredRatio === 'number' ? preferredRatio : 0.0
      const effectiveSchedule = syncSchedule || 'manual'
      const deleteOldCfsVal = deleteOldCfs ? 1 : 0

      const existing = db.prepare('SELECT id FROM recyclarr_config WHERE instance_id = ?').get(instanceId) as { id: string } | undefined
      if (existing) {
        db.prepare(`
          UPDATE recyclarr_config
          SET enabled = ?, templates = ?, score_overrides = ?, user_cf_names = ?,
              preferred_ratio = ?, profiles_config = ?, sync_schedule = ?,
              delete_old_cfs = ?, updated_at = datetime('now')
          WHERE instance_id = ?
        `).run(
          enabled ? 1 : 0,
          JSON.stringify(templates),
          JSON.stringify(scoreOverrides),
          JSON.stringify(userCfNames),
          effectiveRatio,
          JSON.stringify(profilesConfig ?? []),
          effectiveSchedule,
          deleteOldCfsVal,
          instanceId,
        )
      } else {
        db.prepare(`
          INSERT INTO recyclarr_config
            (id, instance_id, enabled, templates, score_overrides, user_cf_names, preferred_ratio, profiles_config, sync_schedule, delete_old_cfs)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          nanoid(),
          instanceId,
          enabled ? 1 : 0,
          JSON.stringify(templates),
          JSON.stringify(scoreOverrides),
          JSON.stringify(userCfNames),
          effectiveRatio,
          JSON.stringify(profilesConfig ?? []),
          effectiveSchedule,
          deleteOldCfsVal,
        )
      }

      // Clear import warning once user explicitly saves
      delSetting(IMPORT_WARNING_KEY)

      // Update cron scheduler for this instance
      scheduleRecyclarrSync(instanceId, effectiveSchedule, app.log)

      // Regenerate YAML
      const allRows = db.prepare('SELECT * FROM recyclarr_config').all() as RecyclarrConfigRow[]
      const allInstances = db.prepare('SELECT id, name, type, url, api_key FROM arr_instances').all() as ArrInstanceRow[]
      const configs: RecyclarrConfig[] = allRows.map(r => ({
        instanceId: r.instance_id,
        enabled: r.enabled === 1,
        templates: JSON.parse(r.templates) as string[],
        scoreOverrides: JSON.parse(r.score_overrides) as ScoreOverride[],
        userCfNames: JSON.parse(r.user_cf_names) as UserCf[],
        preferredRatio: r.preferred_ratio ?? 0.0,
        profilesConfig: JSON.parse(r.profiles_config ?? '[]') as ProfileConfig[],
        deleteOldCfs: r.delete_old_cfs === 1,
      }))
      try {
        await writeYaml(configs, allInstances)
      } catch (e) {
        app.log.warn({ err: e }, 'recyclarr: could not write YAML')
      }

      return reply.send({ ok: true })
    }
  )

  // GET /api/recyclarr/formats/:instanceId — authenticate
  app.get<{ Params: { instanceId: string }; Querystring: { profileSlugs?: string } }>(
    '/api/recyclarr/formats/:instanceId',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const db = getDb()
      const { instanceId } = req.params

      let profileSlugs: string[]

      if (req.query.profileSlugs) {
        // Wizard mode: use slugs from query param (unsaved state)
        profileSlugs = req.query.profileSlugs.split(',').map(s => s.trim()).filter(Boolean)
      } else {
        const configRow = db.prepare('SELECT templates FROM recyclarr_config WHERE instance_id = ?').get(instanceId) as { templates: string } | undefined
        if (!configRow) return reply.send([])

        const templates = JSON.parse(configRow.templates) as string[]
        profileSlugs = templates.filter(t => t.includes('quality-profile'))
      }

      if (profileSlugs.length === 0) {
        return reply.status(400).send({ error: 'Keine Profile konfiguriert — bitte zuerst Profile in Schritt 2 auswählen' })
      }

      const instRow = db.prepare('SELECT type FROM arr_instances WHERE id = ?').get(instanceId) as { type: string } | undefined
      const mediaType: 'radarr' | 'sonarr' = (instRow?.type === 'sonarr') ? 'sonarr' : 'radarr'

      app.log.info({ instanceId, profileSlugs, mediaType }, 'recyclarr: loading CFs for profiles')

      // Load CFs from each profile JSON
      const profileResults = await Promise.all(
        profileSlugs.map(slug => fetchProfileCfsFromTRaSH(slug, mediaType))
      )

      app.log.info({ profileCount: profileResults.length }, 'recyclarr: profiles fetched from TRaSH')

      // Collect all unique trash_ids and their data
      const cfMap = new Map<string, { defaultScore: number; inProfiles: string[] }>()
      for (let i = 0; i < profileSlugs.length; i++) {
        const { cfs, profileName } = profileResults[i]
        for (const cf of cfs) {
          if (!cfMap.has(cf.trash_id)) {
            cfMap.set(cf.trash_id, { defaultScore: cf.score, inProfiles: [profileName] })
          } else {
            cfMap.get(cf.trash_id)!.inProfiles.push(profileName)
          }
        }
      }

      app.log.info({ cfCount: cfMap.size }, 'recyclarr: unique CFs extracted from profiles')

      if (cfMap.size === 0) {
        return reply.send([])
      }

      // Resolve trash_ids to names (best-effort from cache)
      const allIds = Array.from(cfMap.keys())
      const nameMap = await resolveTrashIdNames(allIds, mediaType)

      const entries = allIds.map(trashId => {
        const data = cfMap.get(trashId)!
        return {
          trash_id: trashId,
          name: nameMap.get(trashId) ?? trashId,
          defaultScore: data.defaultScore,
          profileName: data.inProfiles[0] ?? '',
          inProfiles: data.inProfiles,
        }
      })

      return reply.send(entries)
    }
  )

  // GET /api/recyclarr/sync — requireAdmin, SSE stream
  app.get<{ Querystring: { instanceId?: string } }>(
    '/api/recyclarr/sync',
    { onRequest: [app.requireAdmin] },
    async (req, reply) => {
      const { instanceId } = req.query

      reply.hijack()
      reply.raw.setHeader('Content-Type', 'text/event-stream')
      reply.raw.setHeader('Cache-Control', 'no-cache')
      reply.raw.setHeader('Connection', 'keep-alive')
      reply.raw.setHeader('X-Accel-Buffering', 'no')
      reply.raw.flushHeaders()

      const sendEvent = (data: unknown) => {
        if (!reply.raw.destroyed) {
          reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
        }
      }

      const db = getDb()

      // Guard: skip if target instance already syncing
      if (instanceId) {
        const row = db.prepare('SELECT is_syncing FROM recyclarr_config WHERE instance_id = ?').get(instanceId) as { is_syncing: number } | undefined
        if (row?.is_syncing === 1) {
          sendEvent({ error: 'Sync bereits in Ausführung für diese Instanz', done: true, exitCode: 1, success: false })
          if (!reply.raw.destroyed) reply.raw.end()
          return
        }
        db.prepare("UPDATE recyclarr_config SET is_syncing = 1 WHERE instance_id = ?").run(instanceId)
      } else {
        db.prepare("UPDATE recyclarr_config SET is_syncing = 1 WHERE enabled = 1").run()
      }

      const args = ['exec', RECYCLARR_CONTAINER_NAME, 'recyclarr', 'sync']
      if (instanceId) args.push('--instance', instanceId)

      const proc = spawn('docker', args)

      req.raw.on('close', () => {
        proc.kill()
      })

      if (proc.stdout) {
        proc.stdout.on('data', (chunk: Buffer) => {
          const lines = chunk.toString('utf8').split('\n')
          for (const line of lines) {
            if (line.trim()) sendEvent({ line, type: 'stdout' })
          }
        })
      }

      if (proc.stderr) {
        proc.stderr.on('data', (chunk: Buffer) => {
          const lines = chunk.toString('utf8').split('\n')
          for (const line of lines) {
            if (line.trim()) sendEvent({ line, type: 'stderr' })
          }
        })
      }

      await new Promise<void>(resolve => {
        proc.on('close', code => {
          // Track sync completion in DB + clear is_syncing
          try {
            const now = new Date().toISOString()
            const success = code === 0 ? 1 : 0
            if (instanceId) {
              db.prepare("UPDATE recyclarr_config SET last_synced_at = ?, last_sync_success = ?, is_syncing = 0 WHERE instance_id = ?")
                .run(now, success, instanceId)
            } else {
              db.prepare("UPDATE recyclarr_config SET last_synced_at = ?, last_sync_success = ?, is_syncing = 0")
                .run(now, success)
            }
          } catch { /* ignore */ }

          sendEvent({ done: true, exitCode: code ?? 1, success: code === 0 })
          if (!reply.raw.destroyed) reply.raw.end()
          resolve()
        })
        proc.on('error', err => {
          try {
            if (instanceId) {
              db.prepare("UPDATE recyclarr_config SET is_syncing = 0 WHERE instance_id = ?").run(instanceId)
            } else {
              db.prepare("UPDATE recyclarr_config SET is_syncing = 0").run()
            }
          } catch { /* ignore */ }
          sendEvent({ error: err.message })
          if (!reply.raw.destroyed) reply.raw.end()
          resolve()
        })
      })
    }
  )

  // PATCH /api/recyclarr/config/:instanceId/schedule — requireAdmin
  app.patch<{ Params: { instanceId: string }; Body: { sync_schedule: string } }>(
    '/api/recyclarr/config/:instanceId/schedule',
    { onRequest: [app.requireAdmin] },
    async (req, reply) => {
      const db = getDb()
      const { instanceId } = req.params
      const { sync_schedule } = req.body
      if (!sync_schedule) return reply.status(400).send({ error: 'sync_schedule required' })
      if (sync_schedule !== 'manual' && !cron.validate(sync_schedule)) {
        return reply.status(400).send({ error: 'Ungültiger Cron-Ausdruck' })
      }
      const existing = db.prepare('SELECT id FROM recyclarr_config WHERE instance_id = ?').get(instanceId) as { id: string } | undefined
      if (!existing) return reply.status(404).send({ error: 'Not found' })
      db.prepare("UPDATE recyclarr_config SET sync_schedule = ?, updated_at = datetime('now') WHERE instance_id = ?")
        .run(sync_schedule, instanceId)
      scheduleRecyclarrSync(instanceId, sync_schedule, app.log)
      return reply.send({ ok: true })
    }
  )

  // POST /api/recyclarr/refresh-cache — requireAdmin
  app.post(
    '/api/recyclarr/refresh-cache',
    { onRequest: [app.requireAdmin] },
    async (_req, reply) => {
      cfCache.clear()
      saveCacheToDisk()
      return reply.send({ ok: true })
    }
  )
}
