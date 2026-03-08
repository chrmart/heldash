import { create } from 'zustand'
import { api } from '../api'
import type {
  TrashInstanceConfig, TrashProfileSummary, TrashFormatRow,
  TrashPreview, TrashSyncLogEntry, TrashDeprecatedFormat,
  TrashImportableFormat,
} from '../types/trash'

interface TrashState {
  configs: TrashInstanceConfig[]
  profiles: Record<string, TrashProfileSummary[]>       // instanceId → profiles
  formats: Record<string, TrashFormatRow[]>             // instanceId → formats
  preview: Record<string, TrashPreview | null>          // instanceId → preview
  syncLogs: Record<string, TrashSyncLogEntry[]>         // instanceId → logs
  deprecated: Record<string, TrashDeprecatedFormat[]>   // instanceId → deprecated
  importable: Record<string, TrashImportableFormat[]>   // instanceId → importable

  loadConfigs: () => Promise<void>
  configure: (instanceId: string, data: {
    profile_slug?: string | null
    sync_mode?: 'auto' | 'manual' | 'notify'
    sync_interval_hours?: number
    enabled?: boolean
  }) => Promise<void>
  loadProfiles: (instanceId: string) => Promise<void>
  loadFormats: (instanceId: string) => Promise<void>
  loadPreview: (instanceId: string) => Promise<void>
  loadSyncLog: (instanceId: string) => Promise<void>
  loadDeprecated: (instanceId: string) => Promise<void>
  loadImportable: (instanceId: string) => Promise<void>

  triggerSync: (instanceId: string) => Promise<void>
  applyPreview: (instanceId: string, previewId: string) => Promise<void>
  saveOverrides: (instanceId: string, overrides: Array<{ slug: string; score?: number | null; enabled?: boolean }>) => Promise<void>
  deleteDeprecated: (instanceId: string, slug: string) => Promise<void>
  importFormats: (instanceId: string, formatIds: number[]) => Promise<{ imported: number }>
  forceFetchGithub: () => Promise<{ sha: string; filesUpdated: number; formatsUpdated: number }>
}

export const useTrashStore = create<TrashState>((set, get) => ({
  configs: [],
  profiles: {},
  formats: {},
  preview: {},
  syncLogs: {},
  deprecated: {},
  importable: {},

  loadConfigs: async () => {
    const configs = await api.trash.instances.list()
    set({ configs })
  },

  configure: async (instanceId, data) => {
    await api.trash.instances.configure(instanceId, data)
    await get().loadConfigs()
  },

  loadProfiles: async (instanceId) => {
    const profiles = await api.trash.instances.profiles(instanceId)
    set(s => ({ profiles: { ...s.profiles, [instanceId]: profiles } }))
  },

  loadFormats: async (instanceId) => {
    const formats = await api.trash.instances.customFormats(instanceId)
    set(s => ({ formats: { ...s.formats, [instanceId]: formats } }))
  },

  loadPreview: async (instanceId) => {
    try {
      const preview = await api.trash.instances.preview(instanceId)
      set(s => ({ preview: { ...s.preview, [instanceId]: preview } }))
    } catch {
      set(s => ({ preview: { ...s.preview, [instanceId]: null } }))
    }
  },

  loadSyncLog: async (instanceId) => {
    const logs = await api.trash.instances.log(instanceId)
    set(s => ({ syncLogs: { ...s.syncLogs, [instanceId]: logs } }))
  },

  loadDeprecated: async (instanceId) => {
    const rows = await api.trash.instances.deprecated(instanceId)
    set(s => ({ deprecated: { ...s.deprecated, [instanceId]: rows } }))
  },

  loadImportable: async (instanceId) => {
    const rows = await api.trash.instances.importFormats(instanceId)
    set(s => ({ importable: { ...s.importable, [instanceId]: rows } }))
  },

  triggerSync: async (instanceId) => {
    await api.trash.instances.sync(instanceId)
    await get().loadConfigs()
  },

  applyPreview: async (instanceId, previewId) => {
    await api.trash.instances.applyPreview(instanceId, previewId)
    set(s => ({ preview: { ...s.preview, [instanceId]: null } }))
    await get().loadConfigs()
  },

  saveOverrides: async (instanceId, overrides) => {
    await api.trash.instances.saveOverrides(instanceId, overrides)
    await get().loadFormats(instanceId)
  },

  deleteDeprecated: async (instanceId, slug) => {
    await api.trash.instances.deleteDeprecated(instanceId, slug)
    await get().loadDeprecated(instanceId)
  },

  importFormats: async (instanceId, formatIds) => {
    return api.trash.instances.doImportFormats(instanceId, formatIds)
  },

  forceFetchGithub: async () => {
    return api.trash.github.forceFetch()
  },
}))
