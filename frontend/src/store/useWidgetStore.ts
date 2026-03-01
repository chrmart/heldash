import { create } from 'zustand'
import { api } from '../api'
import type { Widget, WidgetStats } from '../types'

interface WidgetState {
  widgets: Widget[]
  stats: Record<string, WidgetStats>
  loading: boolean

  loadWidgets: () => Promise<void>
  createWidget: (data: { type: string; name: string; config: object; show_in_topbar?: boolean }) => Promise<string>
  updateWidget: (id: string, data: Partial<{ name: string; config: object; show_in_topbar: boolean; position: number }>) => Promise<void>
  deleteWidget: (id: string) => Promise<void>
  loadStats: (id: string) => Promise<void>
  setAdGuardProtection: (id: string, enabled: boolean) => Promise<void>
}

export const useWidgetStore = create<WidgetState>((set, get) => ({
  widgets: [],
  stats: {},
  loading: false,

  loadWidgets: async () => {
    set({ loading: true })
    try {
      const widgets = await api.widgets.list()
      set({ widgets })
    } finally {
      set({ loading: false })
    }
  },

  createWidget: async (data) => {
    const widget = await api.widgets.create(data)
    set(state => ({ widgets: [...state.widgets, widget] }))
    return widget.id
  },

  updateWidget: async (id, data) => {
    const updated = await api.widgets.update(id, data)
    set(state => ({ widgets: state.widgets.map(w => w.id === id ? updated : w) }))
  },

  deleteWidget: async (id) => {
    await api.widgets.delete(id)
    set(state => ({
      widgets: state.widgets.filter(w => w.id !== id),
      stats: Object.fromEntries(Object.entries(state.stats).filter(([k]) => k !== id)),
    }))
  },

  loadStats: async (id) => {
    try {
      const s = await api.widgets.stats(id)
      set(state => ({ stats: { ...state.stats, [id]: s } }))
    } catch {
      // ignore stat errors (server may not be Linux / AdGuard unreachable)
    }
  },

  setAdGuardProtection: async (id, enabled) => {
    await api.widgets.setAdGuardProtection(id, enabled)
    // Reload stats so protection_enabled reflects the new state
    await get().loadStats(id)
  },
}))
