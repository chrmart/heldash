import type { Service, Group, Settings, AuthUser, UserRecord, UserGroup, DashboardItem, Widget, WidgetStats, DockerContainer, ContainerStats, Background } from './types'
import type { ArrInstance, ArrStatus, ArrStats, ArrQueueResponse, ArrCalendarItem, ProwlarrIndexer, SabnzbdQueueData, SabnzbdHistoryData } from './types/arr'

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
    uploadIcon: (id: string, data: string, contentType: string) =>
      req<{ icon_url: string }>(`/widgets/${id}/icon`, { method: 'POST', body: JSON.stringify({ data, content_type: contentType }) }),
  },

  dashboard: {
    list: (asGuest?: boolean) => req<DashboardItem[]>(`/dashboard${asGuest ? '?as=guest' : ''}`),
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

  health: () => req<{ status: string; version: string; uptime: number }>('/health'),
  serverTime: () => req<{ iso: string }>('/time'),
}
