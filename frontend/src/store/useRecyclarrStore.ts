import { create } from 'zustand'
import { api } from '../api'
import type {
  RecyclarrProfile,
  RecyclarrCf,
  RecyclarrSettings,
  RecyclarrInstanceConfig,
  RecyclarrScoreOverride,
  RecyclarrUserCf,
  RecyclarrSyncLine,
  RecyclarrProfileConfig,
} from '../types/recyclarr'

interface RecyclarrState {
  profiles: { radarr: RecyclarrProfile[]; sonarr: RecyclarrProfile[] }
  cfs: { radarr: RecyclarrCf[]; sonarr: RecyclarrCf[] }
  profilesWarning: boolean
  cfsWarning: boolean
  settings: RecyclarrSettings | null
  configs: RecyclarrInstanceConfig[]
  syncLines: RecyclarrSyncLine[]
  syncDone: boolean
  syncing: boolean
  loading: boolean

  loadProfiles: (service: 'radarr' | 'sonarr', forceRefresh?: boolean) => Promise<void>
  loadCfs: (service: 'radarr' | 'sonarr', forceRefresh?: boolean) => Promise<void>
  loadSettings: () => Promise<void>
  saveSettings: (settings: Partial<RecyclarrSettings>) => Promise<void>
  loadConfigs: () => Promise<void>
  saveConfig: (instanceId: string, data: {
    enabled: boolean
    selectedProfiles: string[]
    scoreOverrides: RecyclarrScoreOverride[]
    userCfNames: RecyclarrUserCf[]
    preferredRatio: number
    profilesConfig: RecyclarrProfileConfig[]
    syncSchedule: string
    deleteOldCfs: boolean
  }) => Promise<void>
  sync: (instanceId?: string) => void
  adoptCfs: () => Promise<{ ok: boolean; output: string }>
  resetConfig: () => Promise<void>
  clearCache: (service: 'radarr' | 'sonarr') => Promise<void>
}

export const useRecyclarrStore = create<RecyclarrState>((set, get) => ({
  profiles: { radarr: [], sonarr: [] },
  cfs: { radarr: [], sonarr: [] },
  profilesWarning: false,
  cfsWarning: false,
  settings: null,
  configs: [],
  syncLines: [],
  syncDone: false,
  syncing: false,
  loading: false,

  loadProfiles: async (service, forceRefresh = false) => {
    const data = await api.recyclarr.profiles(service, forceRefresh)
    set(s => ({
      profiles: { ...s.profiles, [service]: data.profiles },
      profilesWarning: data.warning,
    }))
  },

  loadCfs: async (service, forceRefresh = false) => {
    const data = await api.recyclarr.cfs(service, forceRefresh)
    set(s => ({
      cfs: { ...s.cfs, [service]: data.cfs },
      cfsWarning: data.warning,
    }))
  },

  loadSettings: async () => {
    const data = await api.settings.get()
    set({
      settings: {
        containerName: (data.recyclarr_container_name as string | undefined) ?? 'recyclarr',
        configPath: (data.recyclarr_config_path as string | undefined) ?? '/recyclarr/recyclarr.yml',
      },
    })
  },

  saveSettings: async (settings) => {
    const patch: Record<string, string> = {}
    if (settings.containerName !== undefined) patch.recyclarr_container_name = settings.containerName
    if (settings.configPath !== undefined) patch.recyclarr_config_path = settings.configPath
    await api.settings.update(patch as Partial<import('../types').Settings>)
    await get().loadSettings()
  },

  loadConfigs: async () => {
    set({ loading: true })
    try {
      const data = await api.recyclarr.configs()
      set({ configs: data.configs })
    } finally {
      set({ loading: false })
    }
  },

  saveConfig: async (instanceId, data) => {
    await api.recyclarr.saveConfig(instanceId, data)
    await get().loadConfigs()
  },

  sync: (instanceId?: string) => {
    const url = instanceId
      ? `/api/recyclarr/sync/${encodeURIComponent(instanceId)}`
      : '/api/recyclarr/global-sync'
    set({ syncing: true, syncLines: [], syncDone: false })

    const es = new EventSource(url)

    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data as string) as RecyclarrSyncLine
        if (data.type === 'done' || data.type === 'error') {
          set(s => ({
            syncing: false,
            syncDone: true,
            syncLines: [...s.syncLines, data],
          }))
          es.close()
          get().loadConfigs().catch(() => {})
        } else {
          set(s => ({ syncLines: [...s.syncLines, data] }))
        }
      } catch { /* ignore parse error */ }
    }

    es.onerror = () => {
      set(s => ({
        syncing: false,
        syncLines: [...s.syncLines, { line: 'Connection lost', type: 'error' as const }],
        syncDone: true,
      }))
      es.close()
    }
  },

  adoptCfs: async () => {
    return api.recyclarr.adopt()
  },

  resetConfig: async () => {
    await api.recyclarr.resetConfig()
    await get().loadConfigs()
  },

  clearCache: async (service) => {
    await api.recyclarr.clearCache(service)
  },
}))
