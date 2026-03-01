import { create } from 'zustand'
import { api } from '../api'
import type { ArrInstance, ArrStatus, ArrStats, ArrQueueResponse, ArrCalendarItem, ProwlarrIndexer, SabnzbdQueueData, SabnzbdHistoryData } from '../types/arr'

interface ArrState {
  instances: ArrInstance[]
  statuses: Record<string, ArrStatus>
  stats: Record<string, ArrStats>
  queues: Record<string, ArrQueueResponse>
  calendars: Record<string, ArrCalendarItem[]>
  indexers: Record<string, ProwlarrIndexer[]>
  sabQueues: Record<string, SabnzbdQueueData>
  histories: Record<string, SabnzbdHistoryData>

  loadInstances: () => Promise<void>
  loadAllStats: () => Promise<void>
  loadStatus: (id: string) => Promise<void>
  loadStats: (id: string) => Promise<void>
  loadQueue: (id: string) => Promise<void>
  loadCalendar: (id: string) => Promise<void>
  loadIndexers: (id: string) => Promise<void>
  loadSabQueue: (id: string) => Promise<void>
  loadHistory: (id: string) => Promise<void>

  createInstance: (data: { type: string; name: string; url: string; api_key: string }) => Promise<void>
  updateInstance: (id: string, data: { name?: string; url?: string; api_key?: string; enabled?: boolean; position?: number }) => Promise<void>
  deleteInstance: (id: string) => Promise<void>
  reorderInstances: (orderedIds: string[]) => Promise<void>
}

export const useArrStore = create<ArrState>((set, get) => ({
  instances: [],
  statuses: {},
  stats: {},
  queues: {},
  calendars: {},
  indexers: {},
  sabQueues: {},
  histories: {},

  loadInstances: async () => {
    const instances = await api.arr.instances.list()
    set({ instances })
  },

  loadAllStats: async () => {
    const { instances } = get()
    await Promise.allSettled(
      instances.filter(i => i.enabled).map(async (i) => {
        try {
          const [status, stats] = await Promise.all([
            api.arr.status(i.id),
            api.arr.stats(i.id),
          ])
          set(state => ({
            statuses: { ...state.statuses, [i.id]: status },
            stats: { ...state.stats, [i.id]: stats },
          }))
        } catch { /* keep previous state on error */ }
      })
    )
  },

  loadStatus: async (id) => {
    const status = await api.arr.status(id)
    set(state => ({ statuses: { ...state.statuses, [id]: status } }))
  },

  loadStats: async (id) => {
    const stats = await api.arr.stats(id)
    set(state => ({ stats: { ...state.stats, [id]: stats } }))
  },

  loadQueue: async (id) => {
    const queue = await api.arr.queue(id)
    set(state => ({ queues: { ...state.queues, [id]: queue } }))
  },

  loadCalendar: async (id) => {
    const calendar = await api.arr.calendar(id)
    set(state => ({ calendars: { ...state.calendars, [id]: calendar } }))
  },

  loadIndexers: async (id) => {
    const indexers = await api.arr.indexers(id)
    set(state => ({ indexers: { ...state.indexers, [id]: indexers } }))
  },

  loadSabQueue: async (id) => {
    const queue = await api.arr.sabQueue(id)
    set(state => ({ sabQueues: { ...state.sabQueues, [id]: queue } }))
  },

  loadHistory: async (id) => {
    const history = await api.arr.history(id)
    set(state => ({ histories: { ...state.histories, [id]: history } }))
  },

  createInstance: async (data) => {
    const instance = await api.arr.instances.create(data)
    set(state => ({ instances: [...state.instances, instance] }))
  },

  updateInstance: async (id, data) => {
    const instance = await api.arr.instances.update(id, data)
    set(state => ({ instances: state.instances.map(i => i.id === id ? instance : i) }))
  },

  reorderInstances: async (orderedIds) => {
    // Optimistic update — apply new order immediately
    set(state => ({
      instances: orderedIds
        .map((id, i) => {
          const inst = state.instances.find(x => x.id === id)
          return inst ? { ...inst, position: i } : null
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    }))
    // Persist all positions in parallel
    await Promise.allSettled(
      orderedIds.map((id, i) => api.arr.instances.update(id, { position: i }))
    )
  },

  deleteInstance: async (id) => {
    await api.arr.instances.delete(id)
    set(state => ({
      instances: state.instances.filter(i => i.id !== id),
      statuses: Object.fromEntries(Object.entries(state.statuses).filter(([k]) => k !== id)),
      stats: Object.fromEntries(Object.entries(state.stats).filter(([k]) => k !== id)),
      queues: Object.fromEntries(Object.entries(state.queues).filter(([k]) => k !== id)),
      calendars: Object.fromEntries(Object.entries(state.calendars).filter(([k]) => k !== id)),
      sabQueues: Object.fromEntries(Object.entries(state.sabQueues).filter(([k]) => k !== id)),
      histories: Object.fromEntries(Object.entries(state.histories).filter(([k]) => k !== id)),
    }))
  },
}))
