import { create } from 'zustand'
import { api } from '../api'
import type { HaInstance, HaPanel, HaEntityFull } from '../types'

interface HaStore {
  instances: HaInstance[]
  panels: HaPanel[]
  // stateMap: instanceId → (entity_id → HaEntityFull)
  stateMap: Record<string, Record<string, HaEntityFull>>
  loadInstances: () => Promise<void>
  loadPanels: () => Promise<void>
  loadStates: (instanceId: string) => Promise<void>
  callService: (instanceId: string, domain: string, service: string, entityId: string) => Promise<void>
  addPanel: (instanceId: string, entityId: string, label?: string, panelType?: string) => Promise<void>
  updatePanel: (panelId: string, data: { label?: string; panel_type?: string }) => Promise<void>
  removePanel: (panelId: string) => Promise<void>
  reorderPanels: (ids: string[]) => Promise<void>
  createInstance: (data: { name: string; url: string; token: string; enabled?: boolean }) => Promise<void>
  updateInstance: (id: string, data: { name?: string; url?: string; token?: string; enabled?: boolean }) => Promise<void>
  deleteInstance: (id: string) => Promise<void>
}

export const useHaStore = create<HaStore>((set, get) => ({
  instances: [],
  panels: [],
  stateMap: {},

  loadInstances: async () => {
    const instances = await api.ha.instances.list()
    set({ instances })
  },

  loadPanels: async () => {
    const panels = await api.ha.panels.list()
    set({ panels })
  },

  loadStates: async (instanceId: string) => {
    const states = await api.ha.instances.states(instanceId)
    const map: Record<string, HaEntityFull> = {}
    for (const s of states) map[s.entity_id] = s
    set(prev => ({ stateMap: { ...prev.stateMap, [instanceId]: map } }))
  },

  callService: async (instanceId, domain, service, entityId) => {
    await api.ha.instances.call(instanceId, domain, service, entityId)
    // Reload states for this instance after call
    await get().loadStates(instanceId)
  },

  addPanel: async (instanceId, entityId, label, panelType) => {
    const panel = await api.ha.panels.add({ instance_id: instanceId, entity_id: entityId, label, panel_type: panelType })
    set(prev => ({ panels: [...prev.panels, panel] }))
  },

  updatePanel: async (panelId, data) => {
    const updated = await api.ha.panels.update(panelId, data)
    set(prev => ({ panels: prev.panels.map(p => p.id === panelId ? updated : p) }))
  },

  removePanel: async (panelId) => {
    await api.ha.panels.delete(panelId)
    set(prev => ({ panels: prev.panels.filter(p => p.id !== panelId) }))
  },

  reorderPanels: async (ids) => {
    const { panels } = get()
    const ordered = ids.map((id, idx) => {
      const p = panels.find(x => x.id === id)!
      return { ...p, position: idx }
    })
    set({ panels: ordered })
    await api.ha.panels.reorder(ids)
  },

  createInstance: async (data) => {
    const inst = await api.ha.instances.create(data)
    set(prev => ({ instances: [...prev.instances, inst].sort((a, b) => a.position - b.position) }))
  },

  updateInstance: async (id, data) => {
    const inst = await api.ha.instances.update(id, data)
    set(prev => ({ instances: prev.instances.map(i => i.id === id ? inst : i) }))
  },

  deleteInstance: async (id) => {
    await api.ha.instances.delete(id)
    set(prev => ({
      instances: prev.instances.filter(i => i.id !== id),
      panels: prev.panels.filter(p => p.instance_id !== id),
    }))
  },
}))
