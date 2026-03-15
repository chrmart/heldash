import { create } from 'zustand'
import { api } from '../api'
import type {
  RecyclarrTemplate,
  RecyclarrInstanceConfig,
  RecyclarrCfEntry,
  RecyclarrScoreOverride,
  RecyclarrUserCf,
  RecyclarrSyncLine,
  RecyclarrProfileConfig,
} from '../types/recyclarr'

interface SyncEvent {
  line?: string
  type?: 'stdout' | 'stderr'
  done?: boolean
  exitCode?: number
  success?: boolean
  error?: string
}

interface RecyclarrState {
  templates: RecyclarrTemplate[]
  templatesLastFetchedAt: string | null
  templatesWarning: boolean
  configs: RecyclarrInstanceConfig[]
  importWarning: string | null
  cfLists: Record<string, RecyclarrCfEntry[]>
  syncLines: RecyclarrSyncLine[]
  syncDone: boolean
  syncExitCode: number | null
  syncing: boolean
  loading: boolean

  loadTemplates: () => Promise<void>
  loadConfigs: () => Promise<void>
  saveConfig: (instanceId: string, data: {
    enabled: boolean
    templates: string[]
    scoreOverrides: RecyclarrScoreOverride[]
    userCfNames: RecyclarrUserCf[]
    preferredRatio: number
    profilesConfig: RecyclarrProfileConfig[]
    syncSchedule: string
    deleteOldCfs: boolean
  }) => Promise<void>
  loadCfList: (instanceId: string, profileSlugs?: string[]) => Promise<void>
  sync: (instanceId?: string) => void
  refreshTemplates: () => Promise<void>
  refreshCache: () => Promise<void>
}

export const useRecyclarrStore = create<RecyclarrState>((set, get) => ({
  templates: [],
  templatesLastFetchedAt: null,
  templatesWarning: false,
  configs: [],
  importWarning: null,
  cfLists: {},
  syncLines: [],
  syncDone: false,
  syncExitCode: null,
  syncing: false,
  loading: false,

  loadTemplates: async () => {
    const data = await api.recyclarr.templates()
    set({
      templates: data.templates,
      templatesLastFetchedAt: data.lastFetchedAt,
      templatesWarning: data.warning,
    })
  },

  loadConfigs: async () => {
    set({ loading: true })
    try {
      const data = await api.recyclarr.configs()
      set({ configs: data.configs, importWarning: data.importWarning ?? null })
    } finally {
      set({ loading: false })
    }
  },

  saveConfig: async (instanceId, data) => {
    await api.recyclarr.saveConfig(instanceId, data)
    await get().loadConfigs()
  },

  loadCfList: async (instanceId, profileSlugs?) => {
    const data = await api.recyclarr.cfList(instanceId, profileSlugs)
    set(s => ({ cfLists: { ...s.cfLists, [instanceId]: data } }))
  },

  sync: (instanceId?: string) => {
    const url = `/api/recyclarr/sync${instanceId ? `?instanceId=${encodeURIComponent(instanceId)}` : ''}`
    set({ syncing: true, syncLines: [], syncDone: false, syncExitCode: null })

    const es = new EventSource(url)

    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data as string) as SyncEvent
        if (data.done) {
          set({ syncing: false, syncDone: true, syncExitCode: data.exitCode ?? null })
          es.close()
          // Reload configs to update lastSyncedAt
          get().loadConfigs().catch(() => {})
        } else if (data.error) {
          set(s => ({
            syncing: false,
            syncLines: [...s.syncLines, { line: data.error!, type: 'stderr' }],
            syncDone: true,
            syncExitCode: 1,
          }))
          es.close()
          get().loadConfigs().catch(() => {})
        } else if (data.line != null) {
          const type: 'stdout' | 'stderr' = data.type === 'stderr' ? 'stderr' : 'stdout'
          set(s => ({ syncLines: [...s.syncLines, { line: data.line!, type }] }))
        }
      } catch { /* ignore parse error */ }
    }

    es.onerror = () => {
      set(s => ({
        syncing: false,
        syncLines: [...s.syncLines, { line: 'Connection lost', type: 'stderr' }],
        syncDone: true,
        syncExitCode: 1,
      }))
      es.close()
    }
  },

  refreshTemplates: async () => {
    const data = await api.recyclarr.refreshTemplates()
    // Reload templates from cache after refresh
    const templates = await api.recyclarr.templates()
    set({
      templates: templates.templates,
      templatesLastFetchedAt: templates.lastFetchedAt,
      templatesWarning: !!data.warning,
    })
  },

  refreshCache: async () => {
    await api.recyclarr.refreshCache()
  },
}))
