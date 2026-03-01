// Shared utility functions

export const normalizeUrl = (u: string) => u.replace(/\/$/, '').toLowerCase()

export function containerCounts(containers: { state: string }[]) {
  let running = 0, stopped = 0, restarting = 0
  for (const c of containers) {
    if (c.state === 'running') running++
    else if (c.state === 'restarting') restarting++
    else if (c.state === 'exited' || c.state === 'dead' || c.state === 'created') stopped++
  }
  return { running, stopped, restarting }
}
