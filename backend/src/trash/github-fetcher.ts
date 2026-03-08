import { request } from 'undici'
import { getDb } from '../db/database'
import type { GithubFile, GithubCommitInfo, TrashGuideFileIndex } from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

const GITHUB_API = 'https://api.github.com'
const RAW_BASE   = 'https://raw.githubusercontent.com'
const OWNER      = 'TRaSH-Guides'
const REPO       = 'Guides'

const JSON_DIRS: Record<'radarr' | 'sonarr', { cf: string; qp: string }> = {
  radarr: { cf: 'docs/json/radarr/cf', qp: 'docs/json/radarr/quality-profiles' },
  sonarr: { cf: 'docs/json/sonarr/cf', qp: 'docs/json/sonarr/quality-profiles' },
}

const MAX_FILE_SIZE_BYTES = 512_000   // 500 KB per file
const MAX_TREE_SIZE_BYTES = 5_242_880 // 5 MB tree manifest
const FETCH_TIMEOUT_MS    = 15_000
const HEADERS_TIMEOUT_MS  = 8_000

// ── Build request headers ─────────────────────────────────────────────────────

function apiHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'heldash-trash-sync/1.0',
  }
  const token = process.env.GITHUB_TOKEN
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

// ── Generic GitHub API GET ────────────────────────────────────────────────────

async function githubGet<T>(path: string, maxBytes?: number): Promise<T> {
  const url = `${GITHUB_API}${path}`
  const res = await request(url, {
    method: 'GET',
    headers: apiHeaders(),
    headersTimeout: HEADERS_TIMEOUT_MS,
    bodyTimeout: FETCH_TIMEOUT_MS,
  })

  if (res.statusCode === 404) {
    for await (const _ of res.body) { /* drain */ }
    throw Object.assign(new Error(`GitHub 404: ${path}`), { statusCode: 404 })
  }

  if (res.statusCode === 403 || res.statusCode === 429) {
    const body = await res.body.text()
    const retryAfter = res.headers['retry-after']
    const resetAt    = res.headers['x-ratelimit-reset']
    const err = Object.assign(
      new Error(`GitHub rate limit: ${res.statusCode}`),
      { statusCode: res.statusCode, retryAfter: retryAfter ? parseInt(retryAfter as string, 10) : undefined, resetAt }
    )
    throw err
  }

  if (res.statusCode >= 400) {
    for await (const _ of res.body) { /* drain */ }
    throw Object.assign(new Error(`GitHub HTTP ${res.statusCode}: ${path}`), { statusCode: res.statusCode })
  }

  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of res.body) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buf.length
    if (maxBytes && total > maxBytes) {
      throw new Error(`GitHub response too large (>${maxBytes} bytes): ${path}`)
    }
    chunks.push(buf)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T
}

// ── Raw file fetch ────────────────────────────────────────────────────────────

async function fetchRawFile(commitSha: string, filePath: string): Promise<string> {
  const url = `${RAW_BASE}/${OWNER}/${REPO}/${commitSha}/${filePath}`
  const res = await request(url, {
    method: 'GET',
    headers: { 'User-Agent': 'heldash-trash-sync/1.0', ...(process.env.GITHUB_TOKEN ? { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
    headersTimeout: HEADERS_TIMEOUT_MS,
    bodyTimeout: FETCH_TIMEOUT_MS,
  })

  if (res.statusCode !== 200) {
    for await (const _ of res.body) { /* drain */ }
    throw Object.assign(new Error(`Raw fetch failed (${res.statusCode}): ${filePath}`), { statusCode: res.statusCode })
  }

  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of res.body) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buf.length
    if (total > MAX_FILE_SIZE_BYTES) {
      throw new Error(`File too large (>${MAX_FILE_SIZE_BYTES} bytes): ${filePath}`)
    }
    chunks.push(buf)
  }
  return Buffer.concat(chunks).toString('utf-8')
}

// ── Commit SHA fetch ──────────────────────────────────────────────────────────

interface GitHubCommitItem { sha: string; commit: { committer: { date: string } } }

export async function fetchLatestCommit(): Promise<GithubCommitInfo> {
  const items = await githubGet<GitHubCommitItem[]>(
    `/repos/${OWNER}/${REPO}/commits?path=docs%2Fjson&per_page=1`
  )
  if (!items || items.length === 0) throw new Error('No commits returned from GitHub')
  const item = items[0]
  return {
    sha: item.sha,
    commitDate: item.commit.committer.date,
  }
}

// ── Tree manifest fetch ───────────────────────────────────────────────────────

interface TreeEntry { path: string; sha: string; size: number; type: string }
interface TreeResponse { tree: TreeEntry[] }

async function fetchTree(commitSha: string): Promise<TreeEntry[]> {
  const data = await githubGet<TreeResponse>(
    `/repos/${OWNER}/${REPO}/git/trees/${commitSha}?recursive=1`,
    MAX_TREE_SIZE_BYTES
  )
  return data.tree ?? []
}

// ── Determine which files need fetching ───────────────────────────────────────

function isTrackedPath(p: string): { arrType: 'radarr' | 'sonarr'; category: 'custom_formats' | 'quality_profiles' } | null {
  for (const [type, dirs] of Object.entries(JSON_DIRS) as Array<['radarr' | 'sonarr', { cf: string; qp: string }]>) {
    if (p.startsWith(dirs.cf + '/') && p.endsWith('.json')) return { arrType: type, category: 'custom_formats' }
    if (p.startsWith(dirs.qp + '/') && p.endsWith('.json')) return { arrType: type, category: 'quality_profiles' }
  }
  return null
}

// ── Main export: fetch only changed files ────────────────────────────────────

export async function fetchChangedFiles(commitInfo: GithubCommitInfo): Promise<GithubFile[]> {
  const db = getDb()

  // Load current file index from DB into a Map for O(1) lookup
  const indexRows = db.prepare('SELECT file_path, file_sha FROM trash_guides_file_index').all() as TrashGuideFileIndex[]
  const knownShas = new Map<string, string>(indexRows.map(r => [r.file_path, r.file_sha]))

  // Fetch the full recursive tree for this commit
  const tree = await fetchTree(commitInfo.sha)

  // Determine which tracked JSON files changed
  const toFetch: Array<{ entry: TreeEntry; arrType: 'radarr' | 'sonarr'; category: 'custom_formats' | 'quality_profiles' }> = []

  // Sort alphabetically for deterministic slug assignment in parser
  const sorted = [...tree].sort((a, b) => a.path.localeCompare(b.path))

  for (const entry of sorted) {
    if (entry.type !== 'blob') continue
    const meta = isTrackedPath(entry.path)
    if (!meta) continue
    if (entry.size > MAX_FILE_SIZE_BYTES) {
      console.warn(`[trash:fetch] Skipping oversized file (${entry.size} bytes): ${entry.path}`)
      continue
    }
    const knownSha = knownShas.get(entry.path)
    if (knownSha === entry.sha) continue   // File unchanged — skip
    toFetch.push({ entry, ...meta })
  }

  if (toFetch.length === 0) return []   // Nothing changed

  // Fetch changed files (sequential to respect rate limits)
  const result: GithubFile[] = []
  for (const { entry, arrType, category } of toFetch) {
    try {
      const content = await fetchRawFile(commitInfo.sha, entry.path)
      result.push({
        path: entry.path,
        sha: entry.sha,
        sizeBytes: entry.size,
        content,
        arrType,
        category,
      })
      // Update file index immediately after successful fetch
      db.prepare(`
        INSERT OR REPLACE INTO trash_guides_file_index (file_path, file_sha, size_bytes, arr_type, last_fetched)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run(entry.path, entry.sha, entry.size, arrType)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[trash:fetch] Skipping file due to error: ${entry.path} — ${msg}`)
    }
  }

  return result
}
