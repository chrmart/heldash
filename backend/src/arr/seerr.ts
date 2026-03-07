import { ArrBaseClient } from './base-client'

interface SeerrRequestCount {
  total: number
  movie: number
  tv: number
  pending: number
  approved: number
  declined: number
  processing: number
  available: number
}

interface SeerrRequestResult {
  id: number
  status: number  // 1=pending, 2=approved, 3=declined
  createdAt: string
  updatedAt: string
  requestedBy: { id: number; displayName?: string; username?: string; email: string }
  media: {
    id: number
    mediaType: 'movie' | 'tv'
    tmdbId: number
    tvdbId?: number | null
    status: number  // 1=unknown, 2=pending, 3=processing, 4=partially_available, 5=available
  }
  seasons?: { seasonNumber: number }[]
}

interface SeerrRequestsResponse {
  pageInfo: { pages: number; pageSize: number; results: number; page: number }
  results: SeerrRequestResult[]
}

interface SeerrStatus {
  version: string
  commitTag?: string
  updateAvailable?: boolean
  commitsBehind?: number
  restartRequired?: boolean
}

export interface SeerrMediaInfo {
  id: number
  mediaType: 'movie' | 'tv'
  tmdbId: number
  tvdbId?: number | null
  // 1=UNKNOWN, 2=PENDING, 3=PROCESSING, 4=PARTIALLY_AVAILABLE, 5=AVAILABLE, 6=DELETED
  status: number
  requests?: { id: number; status: number }[]
}

export interface SeerrDiscoverResult {
  id: number  // TMDB ID
  mediaType: 'movie' | 'tv'
  title?: string       // movies
  name?: string        // TV
  posterPath?: string
  backdropPath?: string
  releaseDate?: string
  firstAirDate?: string
  voteAverage?: number
  overview?: string
  mediaInfo?: SeerrMediaInfo
}

export interface SeerrDiscoverResponse {
  pageInfo?: { pages: number; pageSize: number; results: number; page: number }
  results: SeerrDiscoverResult[]
}

export class SeerrClient extends ArrBaseClient {
  constructor(baseUrl: string, apiKey: string) {
    super(baseUrl, apiKey, 'v1')
  }

  // Seerr status endpoint is /api/v1/status (not /api/v1/system/status)
  async ping(): Promise<boolean> {
    try {
      await this.get<unknown>('status')
      return true
    } catch {
      return false
    }
  }

  getStatus(): Promise<SeerrStatus> {
    return this.get<SeerrStatus>('status')
  }

  getRequestCount(): Promise<SeerrRequestCount> {
    return this.get<SeerrRequestCount>('request/count')
  }

  getRequests(page = 1, filter?: string): Promise<SeerrRequestsResponse> {
    const params: Record<string, string> = { take: '20', skip: String((page - 1) * 20) }
    if (filter && filter !== 'all') params.filter = filter
    return this.get<SeerrRequestsResponse>('request', params)
  }

  approveRequest(id: number): Promise<SeerrRequestResult> {
    return this.post<SeerrRequestResult>(`request/${id}/approve`)
  }

  declineRequest(id: number): Promise<SeerrRequestResult> {
    return this.post<SeerrRequestResult>(`request/${id}/decline`)
  }

  deleteRequest(id: number): Promise<void> {
    return this.del(`request/${id}`)
  }

  getMovieDetails(tmdbId: number): Promise<{ title: string }> {
    return this.get<{ title: string }>(`movie/${tmdbId}`)
  }

  getTvDetails(tmdbId: number): Promise<{ name: string }> {
    return this.get<{ name: string }>(`tv/${tmdbId}`)
  }

  getDiscoverMovies(page = 1, sortBy = 'popularity.desc'): Promise<SeerrDiscoverResponse> {
    return this.get<SeerrDiscoverResponse>('discover/movies', { page: String(page), sortBy })
  }

  getDiscoverTv(page = 1, sortBy = 'popularity.desc'): Promise<SeerrDiscoverResponse> {
    return this.get<SeerrDiscoverResponse>('discover/tv', { page: String(page), sortBy })
  }

  getTrending(): Promise<SeerrDiscoverResponse> {
    return this.get<SeerrDiscoverResponse>('discover/trending')
  }

  search(query: string): Promise<SeerrDiscoverResponse> {
    return this.get<SeerrDiscoverResponse>('search', { query })
  }

  requestMedia(mediaType: 'movie' | 'tv', mediaId: number, seasons?: number[]): Promise<unknown> {
    const body: Record<string, unknown> = { mediaType, mediaId }
    if (seasons && seasons.length > 0) {
      body.seasons = seasons
    }
    return this.post<unknown>('request', body)
  }
}
