export type TrashSyncMode = 'auto' | 'manual' | 'notify'
export type TrashSyncStatus = 'success' | 'partial' | 'error' | 'no_op'
export type TrashSyncTrigger = 'auto' | 'manual' | 'user_confirm' | 'repair' | 'repair_daily'

export interface TrashInstanceConfig {
  id: string
  instance_id: string
  arr_type: 'radarr' | 'sonarr'
  profile_slug: string | null
  sync_mode: TrashSyncMode
  sync_interval_hours: number
  last_sync_at: string | null
  last_sync_sha: string | null
  enabled: boolean
  isSyncing: boolean
}

export interface TrashProfileSummary {
  slug: string
  name: string
  formatCount: number
}

export interface TrashFormatRow {
  slug: string
  name: string
  recommendedScore: number
  score: number
  enabled: boolean
  deprecated: boolean
  arrFormatId: number | null
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

export interface TrashPreviewChange {
  type: 'add' | 'update_conditions' | 'deprecate' | 'update_score' | 'repair'
  slug: string
  name: string
  detail: string
}

export interface TrashPreview {
  id: string
  instanceId: string
  previewBaseSha: string
  createdAt: string
  expiresAt: string
  stale: boolean
  summary: {
    formatsAdded: number
    conditionsUpdated: number
    profilesUpdated: number
    formatsDeprecated: number
    repairItems: number
  }
  changes: TrashPreviewChange[]
}

export interface TrashSyncLogEntry {
  id: string
  instance_id: string
  trigger: TrashSyncTrigger
  status: TrashSyncStatus
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

export interface TrashInstanceSummary {
  instanceId: string
  instanceName: string
  arrType: 'radarr' | 'sonarr'
  profileSlug: string | null
  syncMode: TrashSyncMode
  lastSyncAt: string | null
  lastSyncStatus: TrashSyncStatus | null
  pendingReview: boolean
  formatsActive: number
  formatsDeprecated: number
  isCurrentlySyncing: boolean
}

export interface TrashWidgetStats {
  type: 'trash_guides'
  instances: TrashInstanceSummary[]
}

export interface TrashImportableFormat {
  id: number
  name: string
  specsCount: number
}
