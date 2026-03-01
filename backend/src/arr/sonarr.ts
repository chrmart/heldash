import { ArrBaseClient } from './base-client'

export interface SonarrStatusRow {
  version: string
  instanceName?: string
  isProduction: boolean
}

export interface SonarrSeriesRow {
  id: number
  title: string
  monitored: boolean
  statistics: {
    episodeFileCount: number
    totalEpisodeCount: number
    sizeOnDisk: number
  }
}

export interface SonarrQueueItem {
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

export interface SonarrQueueResponse {
  totalRecords: number
  records: SonarrQueueItem[]
}

export interface SonarrCalendarItem {
  id: number
  title: string
  seasonNumber: number
  episodeNumber: number
  airDateUtc?: string
  hasFile: boolean
  monitored: boolean
  series: { title: string; id: number }
}

export class SonarrClient extends ArrBaseClient {
  constructor(url: string, apiKey: string) {
    super(url, apiKey, 'v3')
  }

  getSeries() {
    return this.get<SonarrSeriesRow[]>('series')
  }

  getQueue() {
    return this.get<SonarrQueueResponse>('queue', { pageSize: '50', sortKey: 'timeleft', sortDir: 'asc' })
  }

  getCalendar(start: string, end: string) {
    return this.get<SonarrCalendarItem[]>('calendar', { start, end, unmonitored: 'false', includeSeries: 'true' })
  }
}
