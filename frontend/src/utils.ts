// Shared utility functions

export const normalizeUrl = (u: string) => u.replace(/\/$/, '').toLowerCase()

export function calcAutoTheme(lightStart: string, darkStart: string): 'dark' | 'light' {
  const now = new Date()
  const current = now.getHours() * 60 + now.getMinutes()
  const [lH, lM] = (lightStart || '08:00').split(':').map(Number)
  const [dH, dM] = (darkStart || '20:00').split(':').map(Number)
  const light = lH * 60 + lM
  const dark = dH * 60 + dM
  if (light < dark) return current >= light && current < dark ? 'light' : 'dark'
  return current >= light || current < dark ? 'light' : 'dark'
}

export function containerCounts(containers: { state: string }[]) {
  let running = 0, stopped = 0, restarting = 0
  for (const c of containers) {
    if (c.state === 'running') running++
    else if (c.state === 'restarting') restarting++
    else if (c.state === 'exited' || c.state === 'dead' || c.state === 'created') stopped++
  }
  return { running, stopped, restarting }
}
