// ── State-based scheduler ─────────────────────────────────────────────────────
// Per-instance timers. No drift on restart: compares now vs last_sync_at.
// Daily repair job runs independently of sync schedule.

import { getDb } from '../db/database'
import { getInterruptedCheckpoints, isDailyRepairDue, markDailyRepairRun } from './repair-engine'
import { runParserMigrations } from './migration-runner'
import type { TrashInstanceConfig } from './types'
import type { FastifyBaseLogger } from 'fastify'

// ── Per-instance sync callback ────────────────────────────────────────────────
// Set by the route module so the scheduler can trigger syncs without circular deps.
type SyncFn = (instanceId: string, trigger: 'auto' | 'repair_daily') => Promise<void>

let syncFn: SyncFn | null = null
let logger: FastifyBaseLogger | null = null

export function registerSyncFn(fn: SyncFn, log: FastifyBaseLogger) {
  syncFn = fn
  logger = log
}

// ── In-progress sync guard ────────────────────────────────────────────────────
const activeSyncs = new Set<string>()

export function isActivelySyncing(instanceId: string): boolean {
  return activeSyncs.has(instanceId)
}

export function acquireSync(instanceId: string): boolean {
  if (activeSyncs.has(instanceId)) return false
  activeSyncs.add(instanceId)
  return true
}

export function releaseSync(instanceId: string) {
  activeSyncs.delete(instanceId)
}

// ── Timer registry ────────────────────────────────────────────────────────────
const timers = new Map<string, NodeJS.Timeout>()

function cancelTimer(instanceId: string) {
  const t = timers.get(instanceId)
  if (t) { clearTimeout(t); timers.delete(instanceId) }
}

function scheduleNext(instanceId: string, delayMs: number) {
  cancelTimer(instanceId)
  const t = setTimeout(() => {
    timers.delete(instanceId)
    triggerSync(instanceId, 'auto').catch(() => {})
  }, Math.max(0, delayMs))
  timers.set(instanceId, t)
}

async function triggerSync(instanceId: string, trigger: 'auto' | 'repair_daily') {
  if (!syncFn) return
  if (!acquireSync(instanceId)) {
    logger?.debug({ instanceId }, 'trash: sync already in progress, skipping auto trigger')
    return
  }
  try {
    await syncFn(instanceId, trigger)
  } catch (err: unknown) {
    logger?.warn({ instanceId, err }, 'trash: scheduled sync failed')
  } finally {
    releaseSync(instanceId)
    // Re-schedule next run after completion
    const db = getDb()
    const cfg = db.prepare(
      'SELECT * FROM trash_instance_configs WHERE instance_id = ?'
    ).get(instanceId) as TrashInstanceConfig | undefined
    if (cfg?.enabled && cfg.sync_mode === 'auto') {
      scheduleNext(instanceId, cfg.sync_interval_hours * 3_600_000)
    }
  }
}

// ── Initialize scheduler on startup ──────────────────────────────────────────
export function initScheduler(log: FastifyBaseLogger) {
  logger = log
  const db = getDb()

  // 1. Run parser migrations
  const migrated = runParserMigrations()
  if (migrated > 0) log.info({ migrated }, 'trash: schema migration applied')

  // 2. Recover interrupted checkpoints (log warning — repair will clean up on next sync)
  const interrupted = getInterruptedCheckpoints()
  for (const chk of interrupted) {
    log.warn({
      instanceId: chk.instanceId,
      completedSteps: chk.completedSteps,
      totalSteps: chk.totalSteps,
      startedAt: chk.startedAt,
    }, 'trash: found interrupted sync checkpoint — repair will run on next sync')
  }

  // 3. Schedule per-instance syncs with stagger to avoid simultaneous GitHub hits
  const configs = db.prepare(
    `SELECT * FROM trash_instance_configs WHERE enabled = 1`
  ).all() as TrashInstanceConfig[]

  let staggerMs = 0

  for (const cfg of configs) {
    const intervalMs = cfg.sync_interval_hours * 3_600_000
    const lastSyncMs = cfg.last_sync_at ? new Date(cfg.last_sync_at).getTime() : 0
    const elapsed = Date.now() - lastSyncMs

    if (elapsed >= intervalMs || !cfg.last_sync_at) {
      // Missed window — catch-up with stagger
      setTimeout(() => triggerSync(cfg.instance_id, 'auto').catch(() => {}), staggerMs)
      staggerMs += 2_000
    } else {
      // Schedule for remaining time in interval
      const remaining = intervalMs - elapsed
      scheduleNext(cfg.instance_id, remaining)
      log.debug({ instanceId: cfg.instance_id, nextSyncInMs: remaining }, 'trash: scheduled next sync')
    }

    // Schedule daily repair if due (independent of sync)
    if (isDailyRepairDue(cfg.instance_id)) {
      setTimeout(() => triggerSync(cfg.instance_id, 'repair_daily').catch(() => {}), staggerMs + 5_000)
    }
  }
}

// ── Reschedule a single instance (call on config change) ─────────────────────
export function rescheduleInstance(instanceId: string) {
  const db = getDb()
  cancelTimer(instanceId)

  const cfg = db.prepare(
    'SELECT * FROM trash_instance_configs WHERE instance_id = ?'
  ).get(instanceId) as TrashInstanceConfig | undefined

  if (!cfg?.enabled || cfg.sync_mode !== 'auto') return

  const intervalMs = cfg.sync_interval_hours * 3_600_000
  const lastSyncMs = cfg.last_sync_at ? new Date(cfg.last_sync_at).getTime() : 0
  const elapsed = Date.now() - lastSyncMs

  if (elapsed >= intervalMs) {
    triggerSync(instanceId, 'auto').catch(() => {})
  } else {
    scheduleNext(instanceId, intervalMs - elapsed)
  }
}

// ── Clear all timers on shutdown ──────────────────────────────────────────────
export function shutdownScheduler() {
  for (const [id, t] of timers) { clearTimeout(t); timers.delete(id) }
  activeSyncs.clear()
}
