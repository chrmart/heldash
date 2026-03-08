import { nanoid } from 'nanoid'
import { getDb } from '../db/database'
import {
  registerMapping, updateConditionsHash, touchLastSeen,
} from './format-id-resolver'
import { getRateLimiter } from './arr-rate-limiter'
import type {
  Changeset, SyncReport, SyncError, SyncTrigger,
  ArrQualityProfile,
} from './types'
import type { TrashArrClient } from './client-interface'

// ── Checkpoint helpers ────────────────────────────────────────────────────────

function startCheckpoint(instanceId: string, totalSteps: number) {
  const db = getDb()
  db.prepare(`
    INSERT OR REPLACE INTO trash_sync_checkpoints
      (instance_id, status, total_steps, completed_steps, last_step, started_at, updated_at)
    VALUES (?, 'in_progress', ?, 0, NULL, datetime('now'), datetime('now'))
  `).run(instanceId, totalSteps)
}

function advanceCheckpoint(instanceId: string, completedSteps: number, lastStep: object) {
  const db = getDb()
  db.prepare(`
    UPDATE trash_sync_checkpoints
    SET completed_steps = ?, last_step = ?, updated_at = datetime('now')
    WHERE instance_id = ?
  `).run(completedSteps, JSON.stringify(lastStep), instanceId)
}

function finishCheckpoint(instanceId: string, status: 'completed' | 'failed') {
  const db = getDb()
  db.prepare(`
    UPDATE trash_sync_checkpoints
    SET status = ?, updated_at = datetime('now')
    WHERE instance_id = ?
  `).run(status, instanceId)
}

// ── Deprecation helpers ───────────────────────────────────────────────────────

function insertDeprecated(instanceId: string, slug: string, name: string, arrFormatId: number | null) {
  const db = getDb()
  db.prepare(`
    INSERT OR IGNORE INTO trash_deprecated_formats
      (id, instance_id, slug, name, arr_format_id, deprecated_at, user_notified)
    VALUES (?, ?, ?, ?, ?, datetime('now'), 0)
  `).run(nanoid(), instanceId, slug, name, arrFormatId)
}

// ── Profile patch helper ──────────────────────────────────────────────────────

function patchProfile(
  liveProfile: ArrQualityProfile,
  changes: Array<{ arrFormatId: number; slug: string; score: number }>,
): { profile: ArrQualityProfile; changed: boolean } {
  if (changes.length === 0) return { profile: liveProfile, changed: false }

  const changeById = new Map(changes.map(c => [c.arrFormatId, c.score]))
  const newFormatItems = [...liveProfile.formatItems]

  let changed = false
  for (const change of changes) {
    const idx = newFormatItems.findIndex(fi => fi.format === change.arrFormatId)
    if (idx >= 0) {
      if (newFormatItems[idx].score !== change.score) {
        newFormatItems[idx] = { ...newFormatItems[idx], score: change.score }
        changed = true
      }
    } else {
      // Format not yet in profile — add it
      newFormatItems.push({ format: change.arrFormatId, name: '', score: change.score })
      changed = true
    }
  }
  void changeById  // used above via closure

  return {
    profile: { ...liveProfile, formatItems: newFormatItems },
    changed,
  }
}

// ── Main execute function ─────────────────────────────────────────────────────

export async function executeSyncChangeset(
  changeset: Changeset,
  client: TrashArrClient,
  trigger: SyncTrigger,
  githubCommitDate: string | null,
): Promise<SyncReport> {
  const db = getDb()
  const syncId = nanoid()
  const startTime = new Date().toISOString()
  const errors: SyncError[] = []
  const { instanceId } = changeset

  if (changeset.isNoOp) {
    const endTime = new Date().toISOString()
    const report: SyncReport = {
      syncId, instanceId, trigger,
      status: 'no_op',
      githubSha: changeset.githubSha,
      githubCommitDate,
      startTime, endTime,
      durationMs: Date.now() - new Date(startTime).getTime(),
      formatsCreated: 0, conditionsUpdated: 0, scoresUpdated: 0,
      formatsDeprecated: 0, profilesUpdated: 0, repairedItems: 0,
      errors: [], isNoOp: true,
    }
    writeSyncLog(db, syncId, report)
    return report
  }

  const totalSteps = (
    changeset.add.length +
    changeset.updateConditions.length +
    changeset.updateProfiles.length +
    changeset.deprecate.length +
    changeset.repair.length
  )
  startCheckpoint(instanceId, totalSteps)

  const limiter = getRateLimiter(instanceId)
  let step = 0
  let formatsCreated = 0
  let conditionsUpdated = 0
  let scoresUpdated = 0
  let formatsDeprecated = 0
  let profilesUpdated = 0
  let repairedItems = 0

  // ── Phase A: Create missing formats ──────────────────────────────────────────
  for (const change of changeset.add) {
    try {
      const created = await limiter.execute(() => client.postCustomFormat({
        name: change.format.name,
        includeCustomFormatWhenRenaming: false,
        specifications: change.format.conditions,
      }))
      // Atomic: register mapping + (optionally) increment count in single transaction
      db.transaction(() => {
        registerMapping(instanceId, change.format.slug, created.id, change.format.conditionsHash)
      })()
      formatsCreated++
      step++
      advanceCheckpoint(instanceId, step, { phase: 'A', slug: change.format.slug, arrId: created.id })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push({ slug: change.format.slug, phase: 'A', message: msg, retries: 3 })
    }
  }

  // ── Phase B: Update conditions ────────────────────────────────────────────────
  for (const change of changeset.updateConditions) {
    try {
      const liveFormat = await limiter.execute(() => client.getCustomFormat(change.arrFormatId))
      await limiter.execute(() => client.putCustomFormat(change.arrFormatId, {
        ...liveFormat,
        specifications: change.newConditions,
      }))
      updateConditionsHash(instanceId, change.slug, change.newConditionsHash)
      conditionsUpdated++
      step++
      advanceCheckpoint(instanceId, step, { phase: 'B', slug: change.slug })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push({ slug: change.slug, phase: 'B', message: msg, retries: 3 })
    }
  }

  // ── Phase C: Profile score patches ───────────────────────────────────────────
  for (const profileUpdate of changeset.updateProfiles) {
    try {
      const liveProfile = await limiter.execute(() => client.getQualityProfile(profileUpdate.profileId))
      const { profile: patched, changed } = patchProfile(liveProfile, profileUpdate.changes)
      if (changed) {
        await limiter.execute(() => client.putQualityProfile(profileUpdate.profileId, patched))
        scoresUpdated += profileUpdate.changes.length
        profilesUpdated++
      }
      // Touch last_seen for all slugs in this profile update
      for (const c of profileUpdate.changes) {
        touchLastSeen(instanceId, c.slug)
      }
      step++
      advanceCheckpoint(instanceId, step, { phase: 'C', profileId: profileUpdate.profileId })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push({ slug: `profile:${profileUpdate.profileId}`, phase: 'C', message: msg, retries: 3 })
    }
  }

  // ── Phase D: Soft deprecate formats removed from upstream ────────────────────
  for (const change of changeset.deprecate) {
    try {
      // Set score = 0 on all profiles referencing this format
      const profiles = await limiter.execute(() => client.getQualityProfiles())
      for (const profile of profiles) {
        const entry = profile.formatItems.find(fi => fi.format === change.arrFormatId)
        if (!entry || entry.score === 0) continue
        const patched = patchProfile(profile, [{ arrFormatId: change.arrFormatId, slug: change.slug, score: 0 }])
        if (patched.changed) {
          await limiter.execute(() => client.putQualityProfile(profile.id, patched.profile))
        }
      }
      insertDeprecated(instanceId, change.slug, change.name, change.arrFormatId)
      formatsDeprecated++
      step++
      advanceCheckpoint(instanceId, step, { phase: 'D', slug: change.slug })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push({ slug: change.slug, phase: 'D', message: msg, retries: 3 })
    }
  }

  // ── Phase E: Repair ───────────────────────────────────────────────────────────
  for (const change of changeset.repair) {
    try {
      if (change.reason === 'missing_in_arr' && change.conditions) {
        if (change.arrFormatId !== null) {
          // Re-register existing format (found by name, mapping was missing)
          registerMapping(instanceId, change.slug, change.arrFormatId, change.conditionsHash ?? '')
        } else {
          // Truly missing — re-create
          const created = await limiter.execute(() => client.postCustomFormat({
            name: change.slug, // best effort name recovery
            includeCustomFormatWhenRenaming: false,
            specifications: change.conditions ?? [],
          }))
          db.transaction(() => {
            registerMapping(instanceId, change.slug, created.id, change.conditionsHash ?? '')
          })()
        }
      } else if (change.reason === 'conditions_drift' && change.conditions && change.arrFormatId) {
        const live = await limiter.execute(() => client.getCustomFormat(change.arrFormatId!))
        await limiter.execute(() => client.putCustomFormat(change.arrFormatId!, {
          ...live,
          specifications: change.conditions ?? [],
        }))
        if (change.conditionsHash) {
          updateConditionsHash(instanceId, change.slug, change.conditionsHash)
        }
      }
      repairedItems++
      step++
      advanceCheckpoint(instanceId, step, { phase: 'E', slug: change.slug, reason: change.reason })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push({ slug: change.slug, phase: 'E', message: msg, retries: 3 })
    }
  }

  const endTime = new Date().toISOString()
  const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime()
  const status = errors.length === 0 ? 'success' : (
    formatsCreated + conditionsUpdated + scoresUpdated + formatsDeprecated + repairedItems > 0
      ? 'partial'
      : 'error'
  )

  finishCheckpoint(instanceId, status === 'error' ? 'failed' : 'completed')

  const report: SyncReport = {
    syncId, instanceId, trigger, status,
    githubSha: changeset.githubSha, githubCommitDate,
    startTime, endTime, durationMs,
    formatsCreated, conditionsUpdated, scoresUpdated,
    formatsDeprecated, profilesUpdated, repairedItems,
    errors, isNoOp: false,
  }
  writeSyncLog(db, syncId, report)

  return report
}

function writeSyncLog(db: ReturnType<typeof getDb>, syncId: string, report: SyncReport) {
  db.prepare(`
    INSERT INTO trash_sync_log
      (id, instance_id, trigger, status, github_sha, github_commit_date,
       formats_created, conditions_updated, scores_updated, formats_deprecated,
       profiles_updated, repaired_items, error_message, started_at, finished_at, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    syncId, report.instanceId, report.trigger, report.status,
    report.githubSha, report.githubCommitDate,
    report.formatsCreated, report.conditionsUpdated, report.scoresUpdated,
    report.formatsDeprecated, report.profilesUpdated, report.repairedItems,
    report.errors.length > 0 ? report.errors.map(e => `${e.phase}:${e.slug}: ${e.message}`).join('; ') : null,
    report.startTime, report.endTime, report.durationMs,
  )

  // Update instance last_sync_at
  db.prepare(`
    UPDATE trash_instance_configs
    SET last_sync_at = ?, last_sync_sha = ?, updated_at = datetime('now')
    WHERE instance_id = ?
  `).run(report.endTime, report.githubSha, report.instanceId)
}
