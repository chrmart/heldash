import { create } from 'zustand'
import { api } from '../api'
import type {
  TrashInstanceConfig, TrashProfileConfig, TrashProfileSummary,
  TrashFormatRow, TrashPreview, TrashSyncLogEntry,
  TrashDeprecatedFormat, TrashImportableFormat,
} from '../types/trash'

// Profile-scoped store key: "instanceId:profileSlug"
const profileKey = (instanceId: string, profileSlug: string) => `${instanceId}:${profileSlug}`

interface TrashState {
  configs: TrashInstanceConfig[]
  profiles: Record<string, TrashProfileSummary[]>           // instanceId → available TRaSH profiles
  formats: Record<string, TrashFormatRow[]>                 // profileKey → formats
  preview: Record<string, TrashPreview | null>              // profileKey → preview
  syncLogs: Record<string, TrashSyncLogEntry[]>             // instanceId → logs (all profiles)
  deprecated: Record<string, TrashDeprecatedFormat[]>       // instanceId → deprecated
  importable: Record<string, TrashImportableFormat[]>       // instanceId → importable
  allFormats: Record<string, TrashFormatRow[]>              // instanceId → all formats (no profile filter)

  loadConfigs: () => Promise<void>
  configure: (instanceId: string, data: {
    sync_mode?: 'auto' | 'manual' | 'notify'
    sync_interval_hours?: number
    enabled?: boolean
  }) => Promise<void>

  // Profile config actions
  addProfileConfig: (instanceId: string, data: {
    profile_slug: string
    sync_mode?: 'auto' | 'manual' | 'notify'
    sync_interval_hours?: number
    enabled?: boolean
  }) => Promise<void>
  updateProfileConfig: (instanceId: string, profileSlug: string, data: {
    sync_mode?: 'auto' | 'manual' | 'notify'
    sync_interval_hours?: number
    enabled?: boolean
  }) => Promise<void>
  deleteProfileConfig: (instanceId: string, profileSlug: string) => Promise<void>

  loadProfiles: (instanceId: string) => Promise<void>
  loadFormats: (instanceId: string, profileSlug: string) => Promise<void>
  loadPreview: (instanceId: string, profileSlug: string) => Promise<void>
  loadSyncLog: (instanceId: string, profileSlug?: string) => Promise<void>
  loadDeprecated: (instanceId: string) => Promise<void>
  loadImportable: (instanceId: string) => Promise<void>
  loadAllFormats: (instanceId: string) => Promise<void>

  triggerSync: (instanceId: string, profileSlug?: string) => Promise<void>
  applyPreview: (instanceId: string, previewId: string, profileSlug: string) => Promise<void>
  saveOverrides: (instanceId: string, profileSlug: string, overrides: Array<{ slug: string; score?: number | null; enabled?: boolean; excluded?: boolean }>) => Promise<void>
  deleteDeprecated: (instanceId: string, slug: string) => Promise<void>
  importFormats: (instanceId: string, formatIds: number[], profileSlug?: string) => Promise<{ imported: number }>
  removeUserFormat: (instanceId: string, slug: string, profileSlug?: string) => Promise<void>
  assignUserFormat: (instanceId: string, slug: string, profileSlug: string | null) => Promise<void>
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
  allFormats: {},

  loadConfigs: async () => {
    const configs = await api.trash.instances.list()
    set({ configs })
  },

  configure: async (instanceId, data) => {
    await api.trash.instances.configure(instanceId, data)
    await get().loadConfigs()
  },

  addProfileConfig: async (instanceId, data) => {
    await api.trash.instances.addProfileConfig(instanceId, data)
    await get().loadConfigs()
  },

  updateProfileConfig: async (instanceId, profileSlug, data) => {
    await api.trash.instances.updateProfileConfig(instanceId, profileSlug, data)
    await get().loadConfigs()
  },

  deleteProfileConfig: async (instanceId, profileSlug) => {
    await api.trash.instances.deleteProfileConfig(instanceId, profileSlug)
    // Clear cached state for this profile
    const key = profileKey(instanceId, profileSlug)
    set(s => {
      const formats = { ...s.formats }
      const preview = { ...s.preview }
      delete formats[key]
      delete preview[key]
      return { formats, preview }
    })
    await get().loadConfigs()
  },

  loadProfiles: async (instanceId) => {
    const profiles = await api.trash.instances.profiles(instanceId)
    set(s => ({ profiles: { ...s.profiles, [instanceId]: profiles } }))
  },

  loadFormats: async (instanceId, profileSlug) => {
    const formats = await api.trash.instances.customFormats(instanceId, profileSlug)
    set(s => ({ formats: { ...s.formats, [profileKey(instanceId, profileSlug)]: formats } }))
  },

  loadPreview: async (instanceId, profileSlug) => {
    try {
      const preview = await api.trash.instances.preview(instanceId, profileSlug)
      set(s => ({ preview: { ...s.preview, [profileKey(instanceId, profileSlug)]: preview } }))
    } catch {
      set(s => ({ preview: { ...s.preview, [profileKey(instanceId, profileSlug)]: null } }))
    }
  },

  loadSyncLog: async (instanceId, profileSlug) => {
    const logs = await api.trash.instances.log(instanceId, profileSlug)
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

  loadAllFormats: async (instanceId) => {
    const formats = await api.trash.instances.customFormats(instanceId)
    set(s => ({ allFormats: { ...s.allFormats, [instanceId]: formats } }))
  },

  triggerSync: async (instanceId, profileSlug) => {
    await api.trash.instances.sync(instanceId, profileSlug)
    await get().loadConfigs()
  },

  applyPreview: async (instanceId, previewId, profileSlug) => {
    await api.trash.instances.applyPreview(instanceId, previewId)
    set(s => ({ preview: { ...s.preview, [profileKey(instanceId, profileSlug)]: null } }))
    await get().loadConfigs()
  },

  saveOverrides: async (instanceId, profileSlug, overrides) => {
    await api.trash.instances.saveOverrides(instanceId, profileSlug, overrides)
    await get().loadFormats(instanceId, profileSlug)
  },

  deleteDeprecated: async (instanceId, slug) => {
    await api.trash.instances.deleteDeprecated(instanceId, slug)
    await get().loadDeprecated(instanceId)
  },

  importFormats: async (instanceId, formatIds, profileSlug) => {
    return api.trash.instances.doImportFormats(instanceId, formatIds, profileSlug)
  },

  removeUserFormat: async (instanceId, slug, profileSlug) => {
    await api.trash.instances.removeUserFormat(instanceId, slug, profileSlug)
  },

  assignUserFormat: async (instanceId, slug, profileSlug) => {
    await api.trash.instances.patchUserFormat(instanceId, slug, { profile_slug: profileSlug })
    const { loadAllFormats, loadFormats, formats } = get()
    await loadAllFormats(instanceId)
    if (profileSlug) await loadFormats(instanceId, profileSlug)
    // also reload old profile if the format was previously in one
    const oldProfile = Object.entries(formats)
      .find(([key, rows]) => key.startsWith(instanceId + ':') && rows.some(r => r.slug === slug))?.[0]
      ?.split(':')[1]
    if (oldProfile && oldProfile !== profileSlug) await loadFormats(instanceId, oldProfile)
  },

  forceFetchGithub: async () => {
    return api.trash.github.forceFetch()
  },
}))
