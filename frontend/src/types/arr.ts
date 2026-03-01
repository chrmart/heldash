export type ArrType = 'radarr' | 'sonarr' | 'prowlarr' | 'sabnzbd'

export interface ArrInstance {
  id: string
  type: ArrType
  name: string
  url: string  // for display only — never used for direct API calls from the frontend
  enabled: boolean
  position: number
  created_at: string
}

// ── Status ────────────────────────────────────────────────────────────────────
export interface ArrStatus {
  online: boolean
  type: ArrType
  version?: string
  instanceName?: string
}

// ── Stats (type-discriminated) ────────────────────────────────────────────────
export interface RadarrStats {
  type: 'radarr'
  movieCount: number
  monitored: number
  withFile: number
  sizeOnDisk: number
}

export interface SonarrStats {
  type: 'sonarr'
  seriesCount: number
  monitored: number
  episodeCount: number
  sizeOnDisk: number
}

export interface ProwlarrStats {
  type: 'prowlarr'
  indexerCount: number
  enabledIndexers: number
  grabCount24h: number
}

export interface SabnzbdStats {
  type: 'sabnzbd'
  speed: string         // "1.2 MB/s" — formatted by SABnzbd
  mbleft: number        // MB remaining in queue
  mb: number            // total MB in queue
  paused: boolean
  queueCount: number    // total items (regardless of slot limit)
  diskspaceFreeGb: number
}

export type ArrStats = RadarrStats | SonarrStats | ProwlarrStats | SabnzbdStats

// ── SABnzbd queue / history ───────────────────────────────────────────────────
export interface SabnzbdQueueSlot {
  nzo_id: string
  filename: string
  status: string
  mbleft: number
  mb: number
  percentage: string  // "75.2"
  timeleft: string    // "0:12:34"
  cat: string
}

export interface SabnzbdQueueData {
  speed: string
  mbleft: string      // float as string
  mb: string
  paused: boolean
  noofslots: number
  slots: SabnzbdQueueSlot[]
}

export interface SabnzbdHistorySlot {
  nzo_id: string
  name: string
  status: string      // "Completed" | "Failed" | ...
  bytes: number
  fail_message: string
  cat: string
  download_time: number
}

export interface SabnzbdHistoryData {
  noofslots: number
  slots: SabnzbdHistorySlot[]
}

// ── Queue ─────────────────────────────────────────────────────────────────────
export interface ArrQueueItem {
  id: number
  title: string
  status: string
  trackedDownloadStatus: string
  size: number
  sizeleft: number
  protocol: string
  downloadClient?: string
  episode?: { title: string; seasonNumber: number; episodeNumber: number }
}

export interface ArrQueueResponse {
  totalRecords: number
  records: ArrQueueItem[]
}

// ── Calendar ──────────────────────────────────────────────────────────────────
export interface RadarrCalendarItem {
  id: number
  title: string
  inCinemas?: string
  digitalRelease?: string
  hasFile: boolean
  monitored: boolean
}

export interface SonarrCalendarItem {
  id: number
  title: string
  seasonNumber: number
  episodeNumber: number
  airDateUtc?: string
  hasFile: boolean
  series: { title: string; id: number }
}

export type ArrCalendarItem = RadarrCalendarItem | SonarrCalendarItem

// ── Prowlarr Indexer ──────────────────────────────────────────────────────────
export interface ProwlarrIndexer {
  id: number
  name: string
  enable: boolean
  protocol: string
  privacy: string
}
