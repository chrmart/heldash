import { nanoid } from 'nanoid'
import { getDb } from '../db/database'
import type { TrashFormatInstance } from './types'

// ── In-memory O(1) slug → arr_format_id mapping ───────────────────────────────
// Loaded from DB on first access per instance. Writes are immediate to both
// in-memory Map and DB. The merge engine uses this — no arr API calls here.

// instanceId → (slug → TrashFormatInstance)
const cache = new Map<string, Map<string, TrashFormatInstance>>()

function ensureLoaded(instanceId: string): Map<string, TrashFormatInstance> {
  let m = cache.get(instanceId)
  if (!m) {
    const db = getDb()
    const rows = db.prepare(
      'SELECT * FROM trash_format_instances WHERE instance_id = ?'
    ).all(instanceId) as TrashFormatInstance[]
    m = new Map(rows.map(r => [r.slug, r]))
    cache.set(instanceId, m)
  }
  return m
}

/** Resolve slug → arr_format_id. Returns null if not mapped yet. O(1). */
export function resolveArrId(instanceId: string, slug: string): number | null {
  const m = ensureLoaded(instanceId)
  return m.get(slug)?.arr_format_id ?? null
}

/** Get the last-applied conditions hash for a slug. Used for drift detection. */
export function getLastConditionsHash(instanceId: string, slug: string): string | null {
  const m = ensureLoaded(instanceId)
  return m.get(slug)?.last_conditions_hash ?? null
}

/** Register a new slug→id mapping after creating a format in arr. Atomic DB write. */
export function registerMapping(
  instanceId: string,
  slug: string,
  arrFormatId: number,
  conditionsHash: string,
): void {
  const db = getDb()
  const now = new Date().toISOString()
  const id = nanoid()
  db.prepare(`
    INSERT OR REPLACE INTO trash_format_instances
      (id, instance_id, slug, arr_format_id, last_conditions_hash, created_at, last_seen)
    VALUES (
      COALESCE((SELECT id FROM trash_format_instances WHERE instance_id=? AND slug=?), ?),
      ?, ?, ?, ?, ?, ?
    )
  `).run(instanceId, slug, id, instanceId, slug, arrFormatId, conditionsHash, now, now)

  // Update in-memory cache
  const m = ensureLoaded(instanceId)
  const existing = m.get(slug)
  m.set(slug, {
    id: existing?.id ?? id,
    instance_id: instanceId,
    slug,
    arr_format_id: arrFormatId,
    last_conditions_hash: conditionsHash,
    created_at: existing?.created_at ?? now,
    last_seen: now,
  })
}

/** Update conditions hash after a successful condition update push. */
export function updateConditionsHash(instanceId: string, slug: string, newHash: string): void {
  const db = getDb()
  const now = new Date().toISOString()
  db.prepare(`
    UPDATE trash_format_instances
    SET last_conditions_hash = ?, last_seen = ?
    WHERE instance_id = ? AND slug = ?
  `).run(newHash, now, instanceId, slug)

  const m = ensureLoaded(instanceId)
  const existing = m.get(slug)
  if (existing) {
    m.set(slug, { ...existing, last_conditions_hash: newHash, last_seen: now })
  }
}

/** Update last_seen timestamp (called on every successful format resolution). */
export function touchLastSeen(instanceId: string, slug: string): void {
  const db = getDb()
  const now = new Date().toISOString()
  db.prepare(
    'UPDATE trash_format_instances SET last_seen = ? WHERE instance_id = ? AND slug = ?'
  ).run(now, instanceId, slug)

  const m = ensureLoaded(instanceId)
  const existing = m.get(slug)
  if (existing) m.set(slug, { ...existing, last_seen: now })
}

/** Get all slugs with stale last_seen (potential orphans). */
export function getStaleSlugMappings(instanceId: string, olderThanDays = 7): TrashFormatInstance[] {
  const db = getDb()
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString()
  return db.prepare(
    'SELECT * FROM trash_format_instances WHERE instance_id = ? AND last_seen < ?'
  ).all(instanceId, cutoff) as TrashFormatInstance[]
}

/** Invalidate in-memory cache for an instance (call after bulk changes). */
export function invalidateCache(instanceId: string): void {
  cache.delete(instanceId)
}

/** Get all mappings for an instance. */
export function getAllMappings(instanceId: string): TrashFormatInstance[] {
  const m = ensureLoaded(instanceId)
  return [...m.values()]
}
