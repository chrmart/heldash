export interface RecyclarrProfile {
  trash_id: string
  name: string
  mediaType: 'radarr' | 'sonarr'
  group: string
  source: 'container' | 'cache'
}

export interface RecyclarrCf {
  trash_id: string
  name: string
  mediaType: 'radarr' | 'sonarr'
}

export interface RecyclarrSettings {
  containerName: string
  configPath: string
}

export interface RecyclarrScoreOverride {
  trash_id: string
  name: string
  score: number
  profileTrashId: string
}

export interface RecyclarrUserCf {
  name: string
  score: number
  profileTrashId: string
  profileName: string
}

export interface RecyclarrProfileConfig {
  trash_id: string
  name: string
  min_format_score?: number
  reset_unmatched_scores_enabled: boolean
  reset_unmatched_scores_except: string[]
}

export interface RecyclarrInstanceConfig {
  instanceId: string
  instanceName: string
  instanceType: 'radarr' | 'sonarr'
  enabled: boolean
  selectedProfiles: string[]
  scoreOverrides: RecyclarrScoreOverride[]
  userCfNames: RecyclarrUserCf[]
  preferredRatio: number
  profilesConfig: RecyclarrProfileConfig[]
  syncSchedule: string
  lastSyncedAt: string | null
  lastSyncSuccess: boolean | null
  deleteOldCfs: boolean
  isSyncing: boolean
}

export interface RecyclarrConfigsResponse {
  configs: RecyclarrInstanceConfig[]
}

export interface RecyclarrSyncLine {
  line: string
  type: 'stdout' | 'stderr' | 'done' | 'error'
}
