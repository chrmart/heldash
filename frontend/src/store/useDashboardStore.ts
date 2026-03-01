import { create } from 'zustand'
import { api } from '../api'
import type { DashboardItem } from '../types'

interface DashboardState {
  items: DashboardItem[]
  editMode: boolean
  loading: boolean

  loadDashboard: () => Promise<void>
  setEditMode: (v: boolean) => void

  addService: (refId: string) => Promise<void>
  addArrInstance: (refId: string) => Promise<void>
  addPlaceholder: (size: 'app' | 'instance' | 'row') => Promise<void>
  removeItem: (id: string) => Promise<void>
  removeByRef: (type: 'service' | 'arr_instance', refId: string) => Promise<void>
  reorder: (orderedIds: string[]) => Promise<void>

  isOnDashboard: (type: 'service' | 'arr_instance', refId: string) => boolean
  getDashboardItemId: (type: 'service' | 'arr_instance', refId: string) => string | undefined
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  items: [],
  editMode: false,
  loading: false,

  loadDashboard: async () => {
    set({ loading: true })
    try {
      const items = await api.dashboard.list()
      set({ items })
    } finally {
      set({ loading: false })
    }
  },

  setEditMode: (v) => set({ editMode: v }),

  addService: async (refId) => {
    const raw = await api.dashboard.addItem('service', refId)
    // Reload to get embedded service data
    await get().loadDashboard()
    return
  },

  addArrInstance: async (refId) => {
    await api.dashboard.addItem('arr_instance', refId)
    await get().loadDashboard()
  },

  addPlaceholder: async (size) => {
    const type = size === 'instance' ? 'placeholder_instance' : size === 'row' ? 'placeholder_row' : 'placeholder_app'
    const raw = await api.dashboard.addItem(type)
    set(state => ({
      items: [...state.items, { id: raw.id, type, position: raw.position } as import('../types').DashboardPlaceholderItem],
    }))
  },

  removeItem: async (id) => {
    set(state => ({ items: state.items.filter(i => i.id !== id) }))
    await api.dashboard.removeItem(id)
  },

  removeByRef: async (type, refId) => {
    set(state => ({
      items: state.items.filter(i => !(i.type === type && 'ref_id' in i && i.ref_id === refId)),
    }))
    await api.dashboard.removeByRef(type, refId)
  },

  reorder: async (orderedIds) => {
    set(state => {
      const map = new Map(state.items.map(i => [i.id, i]))
      const reordered = orderedIds
        .map((id, idx) => {
          const item = map.get(id)
          return item ? { ...item, position: idx } : null
        })
        .filter((x): x is DashboardItem => x !== null)
      return { items: reordered }
    })
    await api.dashboard.reorder(orderedIds)
  },

  isOnDashboard: (type, refId) =>
    get().items.some(i => i.type === type && 'ref_id' in i && i.ref_id === refId),

  getDashboardItemId: (type, refId) => {
    const item = get().items.find(i => i.type === type && 'ref_id' in i && i.ref_id === refId)
    return item?.id
  },
}))
