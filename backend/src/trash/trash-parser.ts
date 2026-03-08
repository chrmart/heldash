import { createHash } from 'node:crypto'
import { getDb } from '../db/database'
import type {
  NormalizedCustomFormat, NormalizedQualityProfile,
  FormatSpecification, NormalizedFormatScore, GithubFile, TrashGuidesCache,
} from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

export const PARSER_SCHEMA_VERSION = 1

const MAX_FORMATS_PER_SYNC = 2_000
const VALID_SCORE_MIN      = -10_000
const VALID_SCORE_MAX      =  10_000

// ── Slug generation ───────────────────────────────────────────────────────────

export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\+/g, '-plus')
    .replace(/&/g, '-and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Assign slugs to a list of names deterministically. Collisions get __dup1, __dup2, ... */
function assignSlugs(names: string[]): Map<number, string> {
  const seen = new Map<string, number>()  // base slug → count
  const result = new Map<number, string>()
  for (let i = 0; i < names.length; i++) {
    const base = toSlug(names[i])
    const count = seen.get(base) ?? 0
    if (count === 0) {
      result.set(i, base)
    } else {
      result.set(i, `${base}__dup${count}`)
    }
    seen.set(base, count + 1)
  }
  return result
}

// ── Conditions hash ───────────────────────────────────────────────────────────

export function hashConditions(conditions: FormatSpecification[]): string {
  const normalized = conditions
    .map(c => ({
      name: c.name,
      implementation: c.implementation,
      negate: c.negate,
      required: c.required,
      fields: Object.fromEntries(Object.entries(c.fields).sort()),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex')
    .slice(0, 16)
}

// ── Raw TRaSH JSON shapes (only used inside this file) ───────────────────────

interface RawSpec {
  name?: unknown
  implementation?: unknown
  negate?: unknown
  required?: unknown
  fields?: unknown
}

interface RawCF {
  trash_id?: unknown
  name?: unknown
  trash_scores?: unknown
  specifications?: unknown
}

interface RawProfileFormat {
  trash_id?: unknown
  score?: unknown
}

interface RawProfile {
  trash_id?: unknown
  name?: unknown
  upgradeAllowed?: unknown
  minFormatScore?: unknown
  cutoffFormatScore?: unknown
  custom_formats?: unknown
}

// ── Specification validation ──────────────────────────────────────────────────

function parseSpec(raw: RawSpec, filePath: string): FormatSpecification | null {
  if (typeof raw.name !== 'string' || !raw.name) {
    console.warn(`[trash:parser] Invalid spec name in ${filePath}`)
    return null
  }
  if (typeof raw.implementation !== 'string' || !raw.implementation) {
    console.warn(`[trash:parser] Missing implementation in spec "${raw.name}" in ${filePath}`)
    return null
  }
  return {
    name: raw.name,
    implementation: raw.implementation,
    negate: raw.negate === true,
    required: raw.required === true,
    fields: (raw.fields !== null && typeof raw.fields === 'object' && !Array.isArray(raw.fields))
      ? (raw.fields as Record<string, unknown>)
      : {},
  }
}

// ── Custom Format parsing ─────────────────────────────────────────────────────

function parseSingleCF(
  raw: RawCF,
  slug: string,
  file: GithubFile,
): NormalizedCustomFormat | null {
  if (typeof raw.name !== 'string' || !raw.name.trim()) {
    console.warn(`[trash:parser] CF missing name in ${file.path}`)
    return null
  }

  const trashId = typeof raw.trash_id === 'string' ? raw.trash_id : ''

  // Parse score
  const scoresRaw = raw.trash_scores
  let recommendedScore = 0
  if (scoresRaw !== null && typeof scoresRaw === 'object' && !Array.isArray(scoresRaw)) {
    const def = (scoresRaw as Record<string, unknown>).default
    if (typeof def === 'number') {
      recommendedScore = Math.max(VALID_SCORE_MIN, Math.min(VALID_SCORE_MAX, Math.round(def)))
    }
  }

  // Parse specifications
  const rawSpecs = Array.isArray(raw.specifications) ? raw.specifications : []
  const specs: FormatSpecification[] = []
  for (const rs of rawSpecs) {
    if (rs !== null && typeof rs === 'object') {
      const parsed = parseSpec(rs as RawSpec, file.path)
      if (parsed) specs.push(parsed)
    }
  }

  if (specs.length === 0) {
    console.warn(`[trash:parser] CF "${raw.name}" has no valid specifications — skipping`)
    return null
  }

  return {
    slug,
    name: raw.name.trim(),
    conditions: specs,
    conditionsHash: hashConditions(specs),
    recommendedScore,
    source: 'trash',
    schemaVersion: PARSER_SCHEMA_VERSION,
    trashId,
    filePath: file.path,
    fileSha: file.sha,
    githubSha: '',
    githubCommitDate: '',
  }
}

// ── Quality Profile parsing ───────────────────────────────────────────────────

function parseSingleProfile(
  raw: RawProfile,
  slug: string,
  file: GithubFile,
  trashIdToSlug: Map<string, string>,
): NormalizedQualityProfile | null {
  if (typeof raw.name !== 'string' || !raw.name.trim()) {
    console.warn(`[trash:parser] Profile missing name in ${file.path}`)
    return null
  }

  const formatScores: NormalizedFormatScore[] = []
  const rawFormats = Array.isArray(raw.custom_formats) ? raw.custom_formats : []
  for (const rf of rawFormats) {
    if (rf === null || typeof rf !== 'object') continue
    const prf = rf as RawProfileFormat
    if (typeof prf.trash_id !== 'string') continue
    const formatSlug = trashIdToSlug.get(prf.trash_id)
    if (!formatSlug) continue   // CF not in our cache — skip
    const score = typeof prf.score === 'number'
      ? Math.max(VALID_SCORE_MIN, Math.min(VALID_SCORE_MAX, Math.round(prf.score)))
      : 0
    formatScores.push({ formatSlug, score })
  }

  return {
    slug,
    name: raw.name.trim(),
    upgradeAllowed: raw.upgradeAllowed === true,
    minFormatScore: typeof raw.minFormatScore === 'number' ? raw.minFormatScore : 0,
    cutoffFormatScore: typeof raw.cutoffFormatScore === 'number' ? raw.cutoffFormatScore : 10_000,
    formatScores,
    schemaVersion: PARSER_SCHEMA_VERSION,
    filePath: file.path,
    fileSha: file.sha,
    githubSha: '',
    githubCommitDate: '',
  }
}

// ── Main parse entry points ───────────────────────────────────────────────────

export function parseCustomFormats(
  files: GithubFile[],
  githubSha: string,
  githubCommitDate: string,
): { formats: NormalizedCustomFormat[]; trashIdToSlug: Map<string, string> } {
  const cfFiles = files.filter(f => f.category === 'custom_formats')
  // Already sorted alphabetically by github-fetcher

  // Two-pass slug assignment for determinism
  const names = cfFiles.map(f => {
    try {
      const raw = JSON.parse(f.content) as RawCF
      return typeof raw.name === 'string' ? raw.name : ''
    } catch { return '' }
  })
  const slugMap = assignSlugs(names)

  const formats: NormalizedCustomFormat[] = []
  const trashIdToSlug = new Map<string, string>()
  let totalCount = 0

  for (let i = 0; i < cfFiles.length; i++) {
    if (totalCount >= MAX_FORMATS_PER_SYNC) {
      console.warn(`[trash:parser] MAX_FORMATS_PER_SYNC (${MAX_FORMATS_PER_SYNC}) reached — stopping`)
      break
    }

    const file = cfFiles[i]
    const slug = slugMap.get(i) ?? ''
    if (!slug) continue

    let raw: RawCF
    try { raw = JSON.parse(file.content) as RawCF }
    catch { console.warn(`[trash:parser] JSON parse failed: ${file.path}`); continue }

    const cf = parseSingleCF(raw, slug, file)
    if (!cf) continue

    cf.githubSha = githubSha
    cf.githubCommitDate = githubCommitDate

    formats.push(cf)
    if (cf.trashId) trashIdToSlug.set(cf.trashId, cf.slug)
    totalCount++
  }

  return { formats, trashIdToSlug }
}

export function parseQualityProfiles(
  files: GithubFile[],
  trashIdToSlug: Map<string, string>,
  githubSha: string,
  githubCommitDate: string,
): NormalizedQualityProfile[] {
  const qpFiles = files.filter(f => f.category === 'quality_profiles')

  const names = qpFiles.map(f => {
    try {
      const raw = JSON.parse(f.content) as RawProfile
      return typeof raw.name === 'string' ? raw.name : ''
    } catch { return '' }
  })
  const slugMap = assignSlugs(names)

  const profiles: NormalizedQualityProfile[] = []

  for (let i = 0; i < qpFiles.length; i++) {
    const file = qpFiles[i]
    const slug = slugMap.get(i) ?? ''
    if (!slug) continue

    let raw: RawProfile
    try { raw = JSON.parse(file.content) as RawProfile }
    catch { console.warn(`[trash:parser] JSON parse failed: ${file.path}`); continue }

    const profile = parseSingleProfile(raw, slug, file, trashIdToSlug)
    if (!profile) continue

    profile.githubSha = githubSha
    profile.githubCommitDate = githubCommitDate
    profiles.push(profile)
  }

  return profiles
}

// ── Persist parsed results to DB cache ───────────────────────────────────────

export function persistToCache(
  formats: NormalizedCustomFormat[],
  profiles: NormalizedQualityProfile[],
  arrType: 'radarr' | 'sonarr',
) {
  const db = getDb()
  const upsertCF = db.prepare(`
    INSERT OR REPLACE INTO trash_guides_cache
      (id, arr_type, category, slug, name, file_path, file_sha,
       raw_data, normalized_data, conditions_hash, github_sha, github_commit_date,
       schema_version, fetched_at)
    VALUES
      (COALESCE((SELECT id FROM trash_guides_cache WHERE arr_type=? AND category=? AND slug=?), lower(hex(randomblob(8)))),
       ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `)

  const upsertQP = db.prepare(`
    INSERT OR REPLACE INTO trash_guides_cache
      (id, arr_type, category, slug, name, file_path, file_sha,
       raw_data, normalized_data, conditions_hash, github_sha, github_commit_date,
       schema_version, fetched_at)
    VALUES
      (COALESCE((SELECT id FROM trash_guides_cache WHERE arr_type=? AND category=? AND slug=?), lower(hex(randomblob(8)))),
       ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, datetime('now'))
  `)

  const txCF = db.transaction((items: NormalizedCustomFormat[]) => {
    for (const f of items) {
      upsertCF.run(
        arrType, 'custom_formats', f.slug,
        arrType, 'custom_formats', f.slug, f.name, f.filePath, f.fileSha,
        '', // raw_data — we don't re-store raw to save space after normalization
        JSON.stringify(f), f.conditionsHash, f.githubSha, f.githubCommitDate,
        PARSER_SCHEMA_VERSION,
      )
    }
  })

  const txQP = db.transaction((items: NormalizedQualityProfile[]) => {
    for (const p of items) {
      upsertQP.run(
        arrType, 'quality_profiles', p.slug,
        arrType, 'quality_profiles', p.slug, p.name, p.filePath, p.fileSha,
        '', // raw_data
        JSON.stringify(p), p.githubSha, p.githubCommitDate,
        PARSER_SCHEMA_VERSION,
      )
    }
  })

  txCF(formats)
  txQP(profiles)
}

// ── Load normalized formats from DB cache ─────────────────────────────────────

export function loadCachedFormats(arrType: 'radarr' | 'sonarr'): NormalizedCustomFormat[] {
  const db = getDb()
  const rows = db.prepare(
    `SELECT normalized_data FROM trash_guides_cache WHERE arr_type = ? AND category = 'custom_formats'`
  ).all(arrType) as { normalized_data: string }[]
  return rows.map(r => JSON.parse(r.normalized_data) as NormalizedCustomFormat)
}

export function loadCachedProfiles(arrType: 'radarr' | 'sonarr'): NormalizedQualityProfile[] {
  const db = getDb()
  const rows = db.prepare(
    `SELECT normalized_data FROM trash_guides_cache WHERE arr_type = ? AND category = 'quality_profiles'`
  ).all(arrType) as { normalized_data: string }[]
  return rows.map(r => JSON.parse(r.normalized_data) as NormalizedQualityProfile)
}
