import { HaWsClient } from './ha-ws-client'

// Keyed by HA instance ID. Clients are created on first subscribe, destroyed on
// instance update/delete or when all SSE subscribers disconnect.
const pool = new Map<string, HaWsClient>()

export function getHaWsClient(instanceId: string, url: string, token: string): HaWsClient {
  let client = pool.get(instanceId)
  if (!client) {
    client = new HaWsClient(url, token, instanceId)
    pool.set(instanceId, client)
  }
  return client
}

export function invalidateHaWsClient(instanceId: string): void {
  const client = pool.get(instanceId)
  if (client) {
    client.destroy()
    pool.delete(instanceId)
  }
}
