import type { Service, Group, Settings, AuthUser, UserRecord, UserGroup, DashboardItem, DashboardGroup, DashboardResponse, Widget, WidgetStats, DockerContainer, ContainerStats, Background, HaInstance, HaPanel, HaEntityFull } from './types'
import type { ArrInstance, ArrStatus, ArrStats, ArrQueueResponse, ArrCalendarItem, ProwlarrIndexer, SabnzbdQueueData, SabnzbdHistoryData, SeerrRequest, SeerrRequestsResponse } from './types/arr'
import type { TrashInstanceConfig, TrashProfileSummary, TrashFormatRow, TrashPreview, TrashSyncLogEntry, TrashDeprecatedFormat, TrashImportableFormat } from './types/trash'

const BASE = '/api'

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    credentials: 'include', // send cookies with every request
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// ─── Services ─────────────────────────────────────────────────────────────────
export const api = {
  services: {
    list: () => req<Service[]>('/services'),
    create: (data: Partial<Service>) => req<Service>('/services', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Service>) => req<Service>(`/services/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/services/${id}`, { method: 'DELETE' }),
    check: (id: string) => req<{ id: string; status: string; checked_at: string }>(`/services/${id}/check`, { method: 'POST', body: JSON.stringify({}) }),
    checkAll: () => req<{ id: string; status: string }[]>('/services/check-all', { method: 'POST', body: JSON.stringify({}) }),
    uploadIcon: (id: string, data: string, contentType: string) =>
      req<{ icon_url: string }>(`/services/${id}/icon`, { method: 'POST', body: JSON.stringify({ data, content_type: contentType }) }),
    export: () => fetch('/api/services/export', { credentials: 'include' }).then(r => r.blob()),
    import: (services: any[]) => req<{ imported: number; skipped: number; total: number; errors?: string[] }>('/services/import', { method: 'POST', body: JSON.stringify({ services }) }),
  },

  groups: {
    list: () => req<Group[]>('/groups'),
    create: (data: Partial<Group>) => req<Group>('/groups', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Group>) => req<Group>(`/groups/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/groups/${id}`, { method: 'DELETE' }),
  },

  settings: {
    get: () => req<Settings>('/settings'),
    update: (data: Partial<Settings>) => req<Settings>('/settings', { method: 'PATCH', body: JSON.stringify(data) }),
  },

  auth: {
    status: () => req<{ needsSetup: boolean; user: AuthUser | null }>('/auth/status'),
    setup: (data: { username: string; password: string; first_name: string; last_name: string; email?: string }) =>
      req<AuthUser>('/auth/setup', { method: 'POST', body: JSON.stringify(data) }),
    login: (username: string, password: string) =>
      req<AuthUser>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    logout: () => req<{ ok: boolean }>('/auth/logout', { method: 'POST', body: JSON.stringify({}) }),
    me: () => req<AuthUser>('/auth/me'),
  },

  users: {
    list: () => req<UserRecord[]>('/users'),
    create: (data: Partial<UserRecord> & { password: string; user_group_id?: string }) =>
      req<UserRecord>('/users', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<UserRecord> & { password?: string }) =>
      req<UserRecord>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/users/${id}`, { method: 'DELETE' }),
  },

  userGroups: {
    list: () => req<UserGroup[]>('/user-groups'),
    create: (data: { name: string; description?: string }) => req<UserGroup>('/user-groups', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/user-groups/${id}`, { method: 'DELETE' }),
    updateVisibility: (id: string, hiddenServiceIds: string[]) =>
      req<{ ok: boolean }>(`/user-groups/${id}/visibility`, {
        method: 'PUT',
        body: JSON.stringify({ hidden_service_ids: hiddenServiceIds }),
      }),
    updateArrVisibility: (id: string, hiddenArrIds: string[]) =>
      req<{ ok: boolean }>(`/user-groups/${id}/arr-visibility`, {
        method: 'PUT',
        body: JSON.stringify({ hidden_arr_ids: hiddenArrIds }),
      }),
    updateWidgetVisibility: (id: string, hiddenWidgetIds: string[]) =>
      req<{ ok: boolean }>(`/user-groups/${id}/widget-visibility`, {
        method: 'PUT',
        body: JSON.stringify({ hidden_widget_ids: hiddenWidgetIds }),
      }),
    updateDockerAccess: (id: string, enabled: boolean) =>
      req<{ ok: boolean }>(`/user-groups/${id}/docker-access`, {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      }),
    updateDockerWidgetAccess: (id: string, enabled: boolean) =>
      req<{ ok: boolean }>(`/user-groups/${id}/docker-widget-access`, {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      }),
  },

  arr: {
    instances: {
      list: () => req<ArrInstance[]>('/arr/instances'),
      create: (data: { type: string; name: string; url: string; api_key: string; enabled?: boolean; position?: number }) =>
        req<ArrInstance>('/arr/instances', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: { name?: string; url?: string; api_key?: string; enabled?: boolean; position?: number }) =>
        req<ArrInstance>(`/arr/instances/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      delete: (id: string) => req<void>(`/arr/instances/${id}`, { method: 'DELETE' }),
      updateVisibility: (groupId: string, hiddenInstanceIds: string[]) =>
        req<{ ok: boolean; hidden_instance_ids: string[] }>(`/arr/groups/${groupId}/visibility`, {
          method: 'PUT',
          body: JSON.stringify({ hidden_instance_ids: hiddenInstanceIds }),
        }),
    },
    status: (id: string) => req<ArrStatus>(`/arr/${id}/status`),
    stats: (id: string) => req<ArrStats>(`/arr/${id}/stats`),
    queue: (id: string) => req<ArrQueueResponse>(`/arr/${id}/queue`),
    sabQueue: (id: string) => req<SabnzbdQueueData>(`/arr/${id}/queue`),
    calendar: (id: string) => req<ArrCalendarItem[]>(`/arr/${id}/calendar`),
    indexers: (id: string) => req<ProwlarrIndexer[]>(`/arr/${id}/indexers`),
    history: (id: string) => req<SabnzbdHistoryData>(`/arr/${id}/history`),
    seerrRequests: (id: string, page = 1, filter?: string) => {
      const params = new URLSearchParams({ page: String(page) })
      if (filter && filter !== 'all') params.set('filter', filter)
      return req<SeerrRequestsResponse>(`/arr/${id}/requests?${params}`)
    },
    seerrApprove: (id: string, requestId: number) =>
      req<SeerrRequest>(`/arr/${id}/requests/${requestId}/approve`, { method: 'POST', body: JSON.stringify({}) }),
    seerrDecline: (id: string, requestId: number) =>
      req<SeerrRequest>(`/arr/${id}/requests/${requestId}/decline`, { method: 'POST', body: JSON.stringify({}) }),
    seerrDelete: (id: string, requestId: number) =>
      req<void>(`/arr/${id}/requests/${requestId}`, { method: 'DELETE' }),
    movies: (id: string) => req<any[]>(`/arr/${id}/movies`),
    series: (id: string) => req<any[]>(`/arr/${id}/series`),
    discoverMovies: (id: string, page = 1, sortBy = 'popularity.desc') => {
      const params = new URLSearchParams({ page: String(page), sortBy })
      return req<any>(`/arr/${id}/discover/movies?${params}`)
    },
    discoverTv: (id: string, page = 1, sortBy = 'popularity.desc') => {
      const params = new URLSearchParams({ page: String(page), sortBy })
      return req<any>(`/arr/${id}/discover/tv?${params}`)
    },
    discoverTrending: (id: string) => req<any>(`/arr/${id}/discover/trending`),
    discoverSearch: (id: string, query: string) => {
      const params = new URLSearchParams({ query })
      return req<any>(`/arr/${id}/discover/search?${params}`)
    },
    discoverRequest: (id: string, mediaType: 'movie' | 'tv', mediaId: number, seasons?: number[]) =>
      req<any>(`/arr/${id}/discover/request`, { method: 'POST', body: JSON.stringify({ mediaType, mediaId, seasons }) }),
  },

  widgets: {
    list: () => req<Widget[]>('/widgets'),
    create: (data: { type: string; name: string; config: object; show_in_topbar?: boolean }) =>
      req<Widget>('/widgets', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<{ name: string; config: object; show_in_topbar: boolean; position: number }>) =>
      req<Widget>(`/widgets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/widgets/${id}`, { method: 'DELETE' }),
    stats: (id: string) => req<WidgetStats>(`/widgets/${id}/stats`),
    setAdGuardProtection: (id: string, enabled: boolean) =>
      req<{ ok: boolean }>(`/widgets/${id}/adguard/protection`, {
        method: 'POST', body: JSON.stringify({ enabled }),
      }),
    triggerButton: (id: string, buttonId: string) =>
      req<{ ok: boolean; status: number }>(`/widgets/${id}/trigger`, { method: 'POST', body: JSON.stringify({ button_id: buttonId }) }),
    haToggle: (id: string, entityId: string, currentState: string) =>
      req<{ ok: boolean }>(`/widgets/${id}/ha/toggle`, { method: 'POST', body: JSON.stringify({ entity_id: entityId, current_state: currentState }) }),
    setPiholeProtection: (id: string, enabled: boolean) =>
      req<{ ok: boolean }>(`/widgets/${id}/pihole/protection`, { method: 'POST', body: JSON.stringify({ enabled }) }),
    uploadIcon: (id: string, data: string, contentType: string) =>
      req<{ icon_url: string }>(`/widgets/${id}/icon`, { method: 'POST', body: JSON.stringify({ data, content_type: contentType }) }),
  },

  dashboard: {
    list: (asGuest?: boolean) => req<DashboardResponse>(`/dashboard${asGuest ? '?as=guest' : ''}`),
    createGroup: (name: string, asGuest?: boolean) =>
      req<DashboardGroup>(`/dashboard/groups${asGuest ? '?as=guest' : ''}`,
        { method: 'POST', body: JSON.stringify({ name }) }),
    updateGroup: (id: string, data: { name?: string; col_span?: number }, asGuest?: boolean) =>
      req<{ ok: boolean }>(`/dashboard/groups/${id}${asGuest ? '?as=guest' : ''}`,
        { method: 'PATCH', body: JSON.stringify(data) }),
    deleteGroup: (id: string, asGuest?: boolean) =>
      req<void>(`/dashboard/groups/${id}${asGuest ? '?as=guest' : ''}`, { method: 'DELETE' }),
    reorderGroups: (ids: string[], asGuest?: boolean) =>
      req<{ ok: boolean }>(`/dashboard/groups/reorder${asGuest ? '?as=guest' : ''}`,
        { method: 'PATCH', body: JSON.stringify({ ids }) }),
    moveItemToGroup: (itemId: string, groupId: string | null, asGuest?: boolean) =>
      req<{ ok: boolean }>(`/dashboard/items/${itemId}/group${asGuest ? '?as=guest' : ''}`,
        { method: 'PATCH', body: JSON.stringify({ group_id: groupId }) }),
    reorderGroupItems: (groupId: string, ids: string[], asGuest?: boolean) =>
      req<{ ok: boolean }>(`/dashboard/groups/${groupId}/reorder-items${asGuest ? '?as=guest' : ''}`,
        { method: 'PATCH', body: JSON.stringify({ ids }) }),
    addItem: (type: string, ref_id?: string, asGuest?: boolean) =>
      req<{ id: string; type: string; ref_id: string | null; position: number }>(
        `/dashboard/items${asGuest ? '?as=guest' : ''}`, { method: 'POST', body: JSON.stringify({ type, ref_id }) }
      ),
    removeItem: (id: string, asGuest?: boolean) => req<void>(`/dashboard/items/${id}${asGuest ? '?as=guest' : ''}`, { method: 'DELETE' }),
    removeByRef: (type: string, ref_id: string, asGuest?: boolean) =>
      req<void>(`/dashboard/items/by-ref${asGuest ? '?as=guest' : ''}`, { method: 'DELETE', body: JSON.stringify({ type, ref_id }) }),
    reorder: (ids: string[], asGuest?: boolean) =>
      req<{ ok: boolean }>(`/dashboard/reorder${asGuest ? '?as=guest' : ''}`, { method: 'PATCH', body: JSON.stringify({ ids }) }),
  },

  docker: {
    containers: () => req<DockerContainer[]>('/docker/containers'),
    stats: (id: string) => req<ContainerStats>(`/docker/containers/${id}/stats`),
    allStats: () => req<Record<string, ContainerStats>>('/docker/stats'),
    control: (id: string, action: 'start' | 'stop' | 'restart') =>
      req<{ ok: boolean }>(`/docker/containers/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) }),
  },

  backgrounds: {
    list: () => req<Background[]>('/backgrounds'),
    mine: () => req<{ id: string; name: string; url: string } | null>('/backgrounds/mine'),
    upload: (name: string, data: string, content_type: string) =>
      req<Background>('/backgrounds', { method: 'POST', body: JSON.stringify({ name, data, content_type }) }),
    delete: (id: string) => req<void>(`/backgrounds/${id}`, { method: 'DELETE' }),
    setGroupBackground: (groupId: string, background_id: string | null) =>
      req<{ ok: boolean }>(`/user-groups/${groupId}/background`, {
        method: 'PUT',
        body: JSON.stringify({ background_id }),
      }),
  },

  ha: {
    instances: {
      list: () => req<HaInstance[]>('/ha/instances'),
      create: (data: { name: string; url: string; token: string; enabled?: boolean }) =>
        req<HaInstance>('/ha/instances', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: { name?: string; url?: string; token?: string; enabled?: boolean }) =>
        req<HaInstance>(`/ha/instances/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      delete: (id: string) => req<void>(`/ha/instances/${id}`, { method: 'DELETE' }),
      test: (id: string) => req<{ ok: boolean; error?: string }>(`/ha/instances/${id}/test`, { method: 'POST', body: JSON.stringify({}) }),
      states: (id: string) => req<HaEntityFull[]>(`/ha/instances/${id}/states`),
      call: (id: string, domain: string, service: string, entity_id: string) =>
        req<{ ok: boolean }>(`/ha/instances/${id}/call`, { method: 'POST', body: JSON.stringify({ domain, service, entity_id }) }),
    },
    panels: {
      list: () => req<HaPanel[]>('/ha/panels'),
      add: (data: { instance_id: string; entity_id: string; label?: string; panel_type?: string }) =>
        req<HaPanel>('/ha/panels', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: { label?: string; panel_type?: string }) =>
        req<HaPanel>(`/ha/panels/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      delete: (id: string) => req<void>(`/ha/panels/${id}`, { method: 'DELETE' }),
      reorder: (ids: string[]) => req<{ ok: boolean }>('/ha/panels/reorder', { method: 'PATCH', body: JSON.stringify({ ids }) }),
    },
  },

  trash: {
    instances: {
      list: () => req<TrashInstanceConfig[]>('/trash/instances'),
      configure: (instanceId: string, data: {
        profile_slug?: string | null
        sync_mode?: 'auto' | 'manual' | 'notify'
        sync_interval_hours?: number
        enabled?: boolean
      }) => req<{ ok: boolean }>(`/trash/instances/${instanceId}/configure`, { method: 'POST', body: JSON.stringify(data) }),
      profiles: (instanceId: string) => req<TrashProfileSummary[]>(`/trash/instances/${instanceId}/profiles`),
      customFormats: (instanceId: string) => req<TrashFormatRow[]>(`/trash/instances/${instanceId}/custom-formats`),
      saveOverrides: (instanceId: string, overrides: Array<{ slug: string; score?: number | null; enabled?: boolean }>) =>
        req<{ ok: boolean }>(`/trash/instances/${instanceId}/overrides`, { method: 'PUT', body: JSON.stringify({ overrides }) }),
      sync: (instanceId: string) => req<{ ok: boolean }>(`/trash/instances/${instanceId}/sync`, { method: 'POST', body: JSON.stringify({}) }),
      preview: (instanceId: string) => req<TrashPreview>(`/trash/instances/${instanceId}/preview`),
      applyPreview: (instanceId: string, previewId: string) =>
        req<{ ok: boolean }>(`/trash/instances/${instanceId}/apply/${previewId}`, { method: 'POST', body: JSON.stringify({}) }),
      log: (instanceId: string) => req<TrashSyncLogEntry[]>(`/trash/instances/${instanceId}/log`),
      deprecated: (instanceId: string) => req<TrashDeprecatedFormat[]>(`/trash/instances/${instanceId}/deprecated`),
      deleteDeprecated: (instanceId: string, slug: string) =>
        req<{ ok: boolean }>(`/trash/instances/${instanceId}/deprecated/${encodeURIComponent(slug)}`, { method: 'DELETE' }),
      importFormats: (instanceId: string) => req<TrashImportableFormat[]>(`/trash/instances/${instanceId}/import-formats`),
      doImportFormats: (instanceId: string, formatIds: number[]) =>
        req<{ imported: number }>(`/trash/instances/${instanceId}/import-formats`, { method: 'POST', body: JSON.stringify({ format_ids: formatIds }) }),
    },
    github: {
      forceFetch: () => req<{ sha: string; filesUpdated: number; formatsUpdated: number }>('/trash/github/fetch', { method: 'POST', body: JSON.stringify({}) }),
    },
  },

  health: () => req<{ status: string; version: string; uptime: number }>('/health'),
  serverTime: () => req<{ iso: string }>('/time'),
}
