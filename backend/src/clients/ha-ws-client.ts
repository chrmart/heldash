import { WebSocket } from 'undici'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HaEntityState {
  entity_id: string
  state: string
  attributes: Record<string, unknown>
  last_changed: string
  last_updated: string
}

type StateListener = (entityId: string, newState: HaEntityState) => void

// ── HA WebSocket Client ───────────────────────────────────────────────────────
// Manages a single persistent WebSocket connection to one HA instance.
// Subscribes to `state_changed` events and fans them out to registered listeners.
// Auto-reconnects with exponential backoff. Stops when all listeners unsubscribe.

export class HaWsClient {
  private ws: WebSocket | null = null
  private msgId = 1
  private listeners = new Set<StateListener>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 5_000
  private destroyed = false

  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  /** Register a listener. Returns an unsubscribe function. */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener)
    if (!this.ws) this.connect()
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0 && !this.destroyed) this.disconnect()
    }
  }

  private connect(): void {
    if (this.destroyed) return
    // Convert http(s):// → ws(s)://
    const wsUrl = this.url.replace(/^http/, 'ws') + '/api/websocket'
    try {
      this.ws = new WebSocket(wsUrl)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onmessage = (event: MessageEvent) => {
      let msg: Record<string, unknown>
      try { msg = JSON.parse(event.data as string) as Record<string, unknown> }
      catch { return }
      this.handleMessage(msg)
    }

    this.ws.onerror = () => { /* handled in onclose */ }

    this.ws.onclose = () => {
      this.ws = null
      if (!this.destroyed && this.listeners.size > 0) this.scheduleReconnect()
    }
  }

  private handleMessage(msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'auth_required':
        this.ws?.send(JSON.stringify({ type: 'auth', access_token: this.token }))
        break

      case 'auth_ok':
        // Reset backoff on successful connection
        this.reconnectDelay = 5_000
        // Subscribe to state_changed events
        this.ws?.send(JSON.stringify({
          id: this.msgId++,
          type: 'subscribe_events',
          event_type: 'state_changed',
        }))
        break

      case 'auth_invalid':
        // Bad token — stop retrying to avoid log spam
        this.destroyed = true
        this.ws?.close()
        break

      case 'event': {
        const ev = msg.event as Record<string, unknown> | undefined
        if (!ev) break
        const data = ev.data as Record<string, unknown> | undefined
        if (!data) break
        const entityId = data.entity_id as string | undefined
        const newState = data.new_state as HaEntityState | null | undefined
        if (entityId && newState) {
          for (const fn of this.listeners) fn(entityId, newState)
        }
        break
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60_000)
      if (!this.destroyed && this.listeners.size > 0) this.connect()
    }, this.reconnectDelay)
  }

  private disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
  }

  destroy(): void {
    this.destroyed = true
    this.listeners.clear()
    this.disconnect()
  }
}
