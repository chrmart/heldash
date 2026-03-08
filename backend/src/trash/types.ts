// ── Normalized types (output of TrashParser) ─────────────────────────────────
// These types are the contract between all trash modules.
// No raw TRaSH JSON shapes appear outside trash-parser.ts.

export interface FormatSpecification {
  name: string
  implementation: string
  negate: boolean
  required: boolean
  fields: Record<string, unknown>
}

export interface NormalizedCustomFormat {
  slug: string
  name: string
  conditions: FormatSpecification[]
  conditionsHash: string        // SHA-256 of sorted conditions JSON (first 16 hex chars)
  recommendedScore: number
  source: 'trash'
  schemaVersion: number
  trashId: string               // original trash_id UUID (kept for profile reference resolution only)
  filePath: string              // relative path in TRaSH repo
  fileSha: string               // GitHub tree object SHA for this file
  githubSha: string
  githubCommitDate: string
}

export interface NormalizedFormatScore {
  formatSlug: string
  score: number
}

export interface NormalizedQualityProfile {
  slug: string
  name: string
  upgradeAllowed: boolean
  minFormatScore: number
  cutoffFormatScore: number
  formatScores: NormalizedFormatScore[]
  schemaVersion: number
  filePath: string
  fileSha: string
  githubSha: string
  githubCommitDate: string
}

// ── Arr snapshot (pre-loaded live state, passed to merge engine) ──────────────

export interface ArrCustomFormat {
  id: number
  name: string
  includeCustomFormatWhenRenaming: boolean
  specifications: FormatSpecification[]
}

export interface ArrFormatScoreItem {
  format: number
  name: string
  score: number
}

export interface ArrQualityProfile {
  id: number
  name: string
  upgradeAllowed: boolean
  cutoff: number
  minFormatScore: number
  cutoffFormatScore: number
  formatItems: ArrFormatScoreItem[]
  // other profile fields preserved verbatim on PUT
  [key: string]: unknown
}

export interface ArrSnapshot {
  formats: ArrCustomFormat[]
  byId: Map<number, ArrCustomFormat>     // O(1) by arr integer ID
  profiles: ArrQualityProfile[]
  profileById: Map<number, ArrQualityProfile>
}

// ── Changeset (output of MergeEngine, input to SyncExecutor) ─────────────────

export interface ChangeAdd {
  format: NormalizedCustomFormat
  score: number
}

export interface ChangeUpdateConditions {
  slug: string
  arrFormatId: number
  newConditions: FormatSpecification[]
  newConditionsHash: string
}

export interface ChangeUpdateScore {
  slug: string
  arrFormatId: number
  score: number
}

export interface ChangeProfileUpdate {
  profileId: number
  profileName: string
  changes: Array<{ arrFormatId: number; slug: string; score: number }>
}

export interface ChangeDeprecate {
  slug: string
  arrFormatId: number
  name: string
}

export type RepairReason = 'missing_in_arr' | 'conditions_drift' | 'score_drift' | 'deprecated_still_enabled'

export interface ChangeRepair {
  slug: string
  arrFormatId: number | null
  reason: RepairReason
  score: number
  conditions?: FormatSpecification[]
  conditionsHash?: string
}

export interface Changeset {
  instanceId: string
  generatedAt: string
  githubSha: string
  add: ChangeAdd[]
  updateConditions: ChangeUpdateConditions[]
  updateScores: ChangeUpdateScore[]
  updateProfiles: ChangeProfileUpdate[]
  deprecate: ChangeDeprecate[]
  repair: ChangeRepair[]
  isNoOp: boolean
}

// ── Sync report (output of SyncExecutor) ─────────────────────────────────────

export type SyncTrigger = 'auto' | 'manual' | 'user_confirm' | 'repair' | 'repair_daily'
export type SyncStatus = 'success' | 'partial' | 'error' | 'no_op'

export interface SyncError {
  slug: string
  phase: 'A' | 'B' | 'C' | 'D' | 'E' | 'snapshot'
  message: string
  retries: number
}

export interface SyncReport {
  syncId: string
  instanceId: string
  trigger: SyncTrigger
  status: SyncStatus
  githubSha: string | null
  githubCommitDate: string | null
  startTime: string
  endTime: string
  durationMs: number
  formatsCreated: number
  conditionsUpdated: number
  scoresUpdated: number
  formatsDeprecated: number
  profilesUpdated: number
  repairedItems: number
  errors: SyncError[]
  isNoOp: boolean
}

// ── DB row types ──────────────────────────────────────────────────────────────

export interface TrashGuidesCache {
  id: string
  arr_type: string
  category: string
  slug: string
  name: string
  file_path: string
  file_sha: string
  raw_data: string
  normalized_data: string
  conditions_hash: string
  github_sha: string
  github_commit_date: string
  schema_version: number
  fetched_at: string
}

export interface TrashGuideFileIndex {
  file_path: string
  file_sha: string
  size_bytes: number
  arr_type: string
  last_fetched: string
}

export interface TrashFormatInstance {
  id: string
  instance_id: string
  slug: string
  arr_format_id: number
  last_conditions_hash: string
  created_at: string
  last_seen: string
}

export interface TrashInstanceConfig {
  id: string
  instance_id: string
  arr_type: string
  profile_slug: string | null
  sync_mode: 'auto' | 'manual' | 'notify'
  sync_interval_hours: number
  last_sync_at: string | null
  last_sync_sha: string | null
  last_repair_daily_at: string | null
  enabled: number
  created_at: string
  updated_at: string
}

export interface TrashUserOverride {
  id: string
  instance_id: string
  slug: string
  score: number | null
  enabled: number
  updated_at: string
}

export interface TrashDeprecatedFormat {
  id: string
  instance_id: string
  slug: string
  name: string
  arr_format_id: number | null
  deprecated_at: string
  user_notified: number
}

export interface TrashSyncCheckpoint {
  instance_id: string
  status: 'in_progress' | 'completed' | 'failed'
  total_steps: number
  completed_steps: number
  last_step: string | null
  started_at: string
  updated_at: string
}

export interface TrashSyncLog {
  id: string
  instance_id: string
  trigger: SyncTrigger
  status: SyncStatus
  github_sha: string | null
  github_commit_date: string | null
  formats_created: number
  conditions_updated: number
  scores_updated: number
  formats_deprecated: number
  profiles_updated: number
  repaired_items: number
  error_message: string | null
  started_at: string
  finished_at: string | null
  duration_ms: number | null
}

// ── GitHub types ──────────────────────────────────────────────────────────────

export interface GithubFile {
  path: string
  sha: string
  sizeBytes: number
  content: string    // raw JSON string
  arrType: 'radarr' | 'sonarr'
  category: 'custom_formats' | 'quality_profiles'
}

export interface GithubCommitInfo {
  sha: string
  commitDate: string
}

// ── Widget stats ──────────────────────────────────────────────────────────────

export interface TrashInstanceSummary {
  instanceId: string
  instanceName: string
  arrType: 'radarr' | 'sonarr'
  profileSlug: string | null
  syncMode: 'auto' | 'manual' | 'notify'
  lastSyncAt: string | null
  lastSyncStatus: SyncStatus | null
  pendingReview: boolean
  formatsActive: number
  formatsDeprecated: number
  isCurrentlySyncing: boolean
}

export interface TrashWidgetStats {
  type: 'trash_guides'
  instances: TrashInstanceSummary[]
}
