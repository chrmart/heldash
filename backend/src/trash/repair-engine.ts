// ── Repair engine ─────────────────────────────────────────────────────────────
// Detects and corrects divergence between expected state (DB) and live arr state.
// Runs as Phase E of normal sync AND as an independent daily job.

import { getDb } from '../db/database'
import {
  getAllMappings, getLastConditionsHash, getStaleSlugMappings,
} from './format-id-resolver'
import type {
  ArrSnapshot, TrashUserOverride, NormalizedCustomFormat,
  ChangeRepair, TrashDeprecatedFormat,
} from './types'

// ── Detection ─────────────────────────────────────────────────────────────────

export interface RepairScan {
  repairs: ChangeRepair[]
  orphanMappings: string[]   // slugs with stale last_seen — surfaced for logging
}

export function scanForRepairs(
  instanceId: string,
  snapshot: ArrSnapshot,
  upstreamFormats: NormalizedCustomFormat[],
  overrides: TrashUserOverride[],
): RepairScan {
  const db = getDb()
  const repairs: ChangeRepair[] = []
  const orphanMappings: string[] = []

  const overrideMap = new Map(overrides.map(o => [o.slug, o]))
  const upstreamBySlug = new Map(upstreamFormats.map(f => [f.slug, f]))

  // Load deprecated slugs to skip re-creating them
  const deprecatedRows = db.prepare(
    'SELECT * FROM trash_deprecated_formats WHERE instance_id = ?'
  ).all(instanceId) as TrashDeprecatedFormat[]
  const deprecatedSlugs = new Set(deprecatedRows.map(r => r.slug))

  const allMappings = getAllMappings(instanceId)

  for (const mapping of allMappings) {
    if (deprecatedSlugs.has(mapping.slug)) {
      // Check if deprecated format still has score > 0 in any profile
      const liveFormat = snapshot.byId.get(mapping.arr_format_id)
      if (!liveFormat) continue

      for (const profile of snapshot.profiles) {
        const entry = profile.formatItems.find(fi => fi.format === mapping.arr_format_id)
        if (entry && entry.score !== 0) {
          repairs.push({
            slug: mapping.slug,
            arrFormatId: mapping.arr_format_id,
            reason: 'deprecated_still_enabled',
            score: 0,
          })
        }
      }
      continue
    }

    const upstream = upstreamBySlug.get(mapping.slug)
    if (!upstream) continue  // User format or not in upstream — skip

    const override = overrideMap.get(mapping.slug)
    if (override?.enabled === 0) continue  // User disabled this format — skip

    const liveFormat = snapshot.byId.get(mapping.arr_format_id)
    if (!liveFormat) {
      // Format missing from arr — needs re-creation
      repairs.push({
        slug: mapping.slug,
        arrFormatId: null,  // Will be re-created
        reason: 'missing_in_arr',
        score: override?.score ?? upstream.recommendedScore,
        conditions: upstream.conditions,
        conditionsHash: upstream.conditionsHash,
      })
      continue
    }

    // Conditions drift check using stored hash
    const lastHash = getLastConditionsHash(instanceId, mapping.slug)
    if (lastHash !== upstream.conditionsHash) {
      repairs.push({
        slug: mapping.slug,
        arrFormatId: mapping.arr_format_id,
        reason: 'conditions_drift',
        score: override?.score ?? upstream.recommendedScore,
        conditions: upstream.conditions,
        conditionsHash: upstream.conditionsHash,
      })
    }
  }

  // Detect orphan mappings (stale last_seen — might have been renamed in arr)
  const stale = getStaleSlugMappings(instanceId, 7)
  for (const s of stale) {
    if (!snapshot.byId.has(s.arr_format_id)) {
      orphanMappings.push(s.slug)
    }
  }

  return { repairs, orphanMappings }
}

// ── Mark daily repair as run ──────────────────────────────────────────────────

export function markDailyRepairRun(instanceId: string) {
  const db = getDb()
  db.prepare(`
    UPDATE trash_instance_configs
    SET last_repair_daily_at = datetime('now'), updated_at = datetime('now')
    WHERE instance_id = ?
  `).run(instanceId)
}

// ── Check if daily repair is due ──────────────────────────────────────────────

export function isDailyRepairDue(instanceId: string): boolean {
  const db = getDb()
  const row = db.prepare(
    'SELECT last_repair_daily_at FROM trash_instance_configs WHERE instance_id = ?'
  ).get(instanceId) as { last_repair_daily_at: string | null } | undefined

  if (!row) return false
  if (!row.last_repair_daily_at) return true

  const lastRun = new Date(row.last_repair_daily_at).getTime()
  return Date.now() - lastRun >= 24 * 60 * 60 * 1_000
}

// ── Recover interrupted checkpoints ──────────────────────────────────────────

export interface InterruptedCheckpoint {
  instanceId: string
  completedSteps: number
  totalSteps: number
  lastStep: string | null
  startedAt: string
}

export function getInterruptedCheckpoints(): InterruptedCheckpoint[] {
  const db = getDb()
  return db.prepare(
    `SELECT instance_id, completed_steps, total_steps, last_step, started_at
     FROM trash_sync_checkpoints WHERE status = 'in_progress'`
  ).all() as InterruptedCheckpoint[]
}
