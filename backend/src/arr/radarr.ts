import { ArrBaseClient } from './base-client'

export interface RadarrStatusRow {
  version: string
  instanceName?: string
  isProduction: boolean
}

export interface RadarrMovieRow {
  id: number
  title: string
  monitored: boolean
  hasFile: boolean
  sizeOnDisk: number
  inCinemas?: string
  digitalRelease?: string
  images?: { coverType: string; remoteUrl: string }[]
}

export interface RadarrQueueItem {
  id: number
  title: string
  status: string
  trackedDownloadStatus: string
  size: number
  sizeleft: number
  protocol: string
  downloadClient?: string
}

export interface RadarrQueueResponse {
  totalRecords: number
  records: RadarrQueueItem[]
}

export interface RadarrCalendarItem {
  id: number
  title: string
  inCinemas?: string
  digitalRelease?: string
  hasFile: boolean
  monitored: boolean
}

export interface RadarrHealthItem {
  source: string
  type: string   // 'ok' | 'notice' | 'warning' | 'error'
  message: string
  wikiUrl?: string
}

export interface RadarrDiskSpace {
  path: string
  label: string
  freeSpace: number
  totalSpace: number
}

export interface RadarrWantedResponse {
  totalRecords: number
  records: RadarrMovieRow[]
}

export class RadarrClient extends ArrBaseClient {
  constructor(url: string, apiKey: string) {
    super(url, apiKey, 'v3')
  }

  getMovies() {
    return this.get<RadarrMovieRow[]>('movie')
  }

  getQueue() {
    return this.get<RadarrQueueResponse>('queue', { pageSize: '50', sortKey: 'timeleft', sortDir: 'asc' })
  }

  getCalendar(start: string, end: string) {
    return this.get<RadarrCalendarItem[]>('calendar', { start, end, unmonitored: 'false' })
  }

  getHealth() {
    return this.get<RadarrHealthItem[]>('health')
  }

  getDiskSpace() {
    return this.get<RadarrDiskSpace[]>('diskspace')
  }

  getWantedMissing() {
    return this.get<RadarrWantedResponse>('wanted/missing', { pageSize: '1', monitored: 'true' })
  }

  // ── TRaSH Sync: Custom Formats ───────────────────────────────────────────────
  getCustomFormats() { return this.get<import('../trash/types').ArrCustomFormat[]>('customformat') }
  getCustomFormat(id: number) { return this.get<import('../trash/types').ArrCustomFormat>(`customformat/${id}`) }
  postCustomFormat(body: import('../trash/client-interface').CreateCustomFormatBody) {
    return this.post<import('../trash/types').ArrCustomFormat>('customformat', body)
  }
  putCustomFormat(id: number, body: import('../trash/types').ArrCustomFormat) {
    return this.put<import('../trash/types').ArrCustomFormat>(`customformat/${id}`, body)
  }
  deleteCustomFormat(id: number) { return this.del(`customformat/${id}`) }

  // ── TRaSH Sync: Quality Profiles ─────────────────────────────────────────────
  getQualityProfiles() { return this.get<import('../trash/types').ArrQualityProfile[]>('qualityprofile') }
  getQualityProfile(id: number) { return this.get<import('../trash/types').ArrQualityProfile>(`qualityprofile/${id}`) }
  putQualityProfile(id: number, body: import('../trash/types').ArrQualityProfile) {
    return this.put<import('../trash/types').ArrQualityProfile>(`qualityprofile/${id}`, body)
  }
}
