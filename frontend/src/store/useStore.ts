import { create } from 'zustand'
import type { Service, Group, Settings, ThemeMode, ThemeAccent } from '../types'
import { api } from '../api'

interface AppState {
  // Data
  services: Service[]
  groups: Group[]
  settings: Settings | null
  loading: boolean
  error: string | null

  // Actions
  loadAll: () => Promise<void>
  loadServices: () => Promise<void>
  createService: (data: Partial<Service>) => Promise<string>
  uploadServiceIcon: (id: string, file: File) => Promise<void>
  updateService: (id: string, data: Partial<Service>) => Promise<void>
  deleteService: (id: string) => Promise<void>
  checkService: (id: string) => Promise<void>
  checkAllServices: () => Promise<void>
  reorderGroups: (orderedIds: string[]) => Promise<void>
  reorderServices: (groupId: string | null, orderedIds: string[]) => Promise<void>

  loadGroups: () => Promise<void>
  createGroup: (data: Partial<Group>) => Promise<void>
  updateGroup: (id: string, data: Partial<Group>) => Promise<void>
  deleteGroup: (id: string) => Promise<void>

  loadSettings: () => Promise<void>
  updateSettings: (data: Partial<Settings>) => Promise<void>
  setThemeMode: (mode: ThemeMode) => Promise<void>
  setThemeAccent: (accent: ThemeAccent) => Promise<void>
}

export const useStore = create<AppState>((set, get) => ({
  services: [],
  groups: [],
  settings: null,
  loading: false,
  error: null,

  loadAll: async () => {
    set({ loading: true, error: null })
    try {
      const [services, groups, settings] = await Promise.all([
        api.services.list(),
        api.groups.list(),
        api.settings.get(),
      ])
      // Parse tags JSON string from SQLite
      const parsedServices = services.map(s => ({
        ...s,
        tags: typeof s.tags === 'string' ? JSON.parse(s.tags) : s.tags,
      }))
      set({ services: parsedServices, groups, settings, loading: false })
    } catch (e: any) {
      set({ error: e.message, loading: false })
    }
  },

  loadServices: async () => {
    const services = await api.services.list()
    const parsed = services.map(s => ({ ...s, tags: typeof s.tags === 'string' ? JSON.parse(s.tags) : s.tags }))
    set({ services: parsed })
  },

  createService: async (data) => {
    const svc = await api.services.create(data)
    const parsed = { ...svc, tags: typeof svc.tags === 'string' ? JSON.parse(svc.tags) : svc.tags }
    set(state => ({ services: [...state.services, parsed] }))
    // Trigger an immediate status check so the card shows online/offline right away
    if (svc.check_enabled) {
      get().checkService(parsed.id).catch(() => { /* ignore */ })
    }
    return parsed.id
  },

  uploadServiceIcon: async (id, file) => {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    const result = await api.services.uploadIcon(id, base64, file.type)
    set(state => ({
      services: state.services.map(s => s.id === id ? { ...s, icon_url: result.icon_url } : s),
    }))
  },

  updateService: async (id, data) => {
    const svc = await api.services.update(id, data)
    const parsed = { ...svc, tags: typeof svc.tags === 'string' ? JSON.parse(svc.tags) : svc.tags }
    set(state => ({ services: state.services.map(s => s.id === id ? parsed : s) }))
  },

  deleteService: async (id) => {
    await api.services.delete(id)
    set(state => ({ services: state.services.filter(s => s.id !== id) }))
  },

  checkService: async (id) => {
    const result = await api.services.check(id)
    set(state => ({
      services: state.services.map(s => s.id === id
        ? { ...s, last_status: result.status as any, last_checked: result.checked_at }
        : s
      )
    }))
  },

  reorderGroups: async (orderedIds) => {
    set(state => ({
      groups: orderedIds.map((id, i) => {
        const g = state.groups.find(g => g.id === id)!
        return { ...g, position: i }
      }),
    }))
    await Promise.all(orderedIds.map((id, i) => api.groups.update(id, { position: i })))
  },

  reorderServices: async (groupId, orderedIds) => {
    set(state => {
      const idxMap: Record<string, number> = Object.fromEntries(orderedIds.map((id, i) => [id, i]))
      return {
        services: state.services.map(s =>
          idxMap[s.id] !== undefined ? { ...s, position_x: idxMap[s.id] } : s
        ),
      }
    })
    await Promise.all(orderedIds.map((id, i) => api.services.update(id, { position_x: i })))
  },

  checkAllServices: async () => {
    const results = await api.services.checkAll()
    const map = Object.fromEntries(results.map(r => [r.id, r.status]))
    set(state => ({
      services: state.services.map(s => map[s.id]
        ? { ...s, last_status: map[s.id] as any, last_checked: new Date().toISOString() }
        : s
      )
    }))
  },

  loadGroups: async () => {
    const groups = await api.groups.list()
    set({ groups })
  },

  createGroup: async (data) => {
    const group = await api.groups.create(data)
    set(state => ({ groups: [...state.groups, group] }))
  },

  updateGroup: async (id, data) => {
    const group = await api.groups.update(id, data)
    set(state => ({ groups: state.groups.map(g => g.id === id ? group : g) }))
  },

  deleteGroup: async (id) => {
    await api.groups.delete(id)
    set(state => ({ groups: state.groups.filter(g => g.id !== id) }))
  },

  loadSettings: async () => {
    const settings = await api.settings.get()
    set({ settings })
    applyTheme(settings)
  },

  updateSettings: async (data) => {
    const settings = await api.settings.update(data)
    set({ settings })
    applyTheme(settings)
  },

  setThemeMode: async (mode) => {
    await get().updateSettings({ theme_mode: mode })
  },

  setThemeAccent: async (accent) => {
    await get().updateSettings({ theme_accent: accent })
  },
}))

function applyTheme(settings: Settings) {
  const root = document.documentElement
  root.setAttribute('data-theme', settings.theme_mode)
  root.setAttribute('data-accent', settings.theme_accent)
}
