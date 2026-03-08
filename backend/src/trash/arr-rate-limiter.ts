// ── Token-bucket rate limiter for Arr API calls ───────────────────────────────
// Max 5 requests per second per instance. Excess requests are queued.
// All arr API calls in sync-executor.ts go through this limiter.

const CAPACITY = 5          // max tokens
const REFILL_RATE = 5       // tokens per second
const MAX_RETRIES = 3
const RETRY_DELAYS_MS = [1_000, 3_000, 5_000]

export class ArrRateLimiter {
  private tokens: number
  private lastRefill: number
  private queue: Array<() => void> = []
  private processing = false

  constructor() {
    this.tokens = CAPACITY
    this.lastRefill = Date.now()
  }

  /** Wrap any async fn with rate limiting + exponential-backoff retry. */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquireToken()
    return this.withRetry(fn, 0)
  }

  private refill() {
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1_000
    const refilled = Math.floor(elapsed * REFILL_RATE)
    if (refilled > 0) {
      this.tokens = Math.min(CAPACITY, this.tokens + refilled)
      this.lastRefill = now
    }
  }

  private acquireToken(): Promise<void> {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        this.refill()
        if (this.tokens > 0) {
          this.tokens--
          resolve()
        } else {
          // Re-check after 1/REFILL_RATE seconds
          setTimeout(tryAcquire, Math.ceil(1_000 / REFILL_RATE))
        }
      }
      tryAcquire()
    })
  }

  private async withRetry<T>(fn: () => Promise<T>, attempt: number): Promise<T> {
    try {
      return await fn()
    } catch (err: unknown) {
      if (attempt >= MAX_RETRIES) throw err

      const status = (err as { statusCode?: number }).statusCode
      // Don't retry client errors (4xx) except 429 (rate limit)
      if (status !== undefined && status >= 400 && status < 500 && status !== 429) throw err

      const delay = RETRY_DELAYS_MS[attempt] ?? 5_000
      // Honour Retry-After on 429
      if (status === 429) {
        const retryAfter = (err as { retryAfter?: number }).retryAfter
        await sleep(retryAfter ? retryAfter * 1_000 : delay)
      } else {
        await sleep(delay)
      }

      // Acquire a new token for the retry
      await this.acquireToken()
      return this.withRetry(fn, attempt + 1)
    }
  }
}

// Singleton pool — one rate limiter per arr instance ID
const pool = new Map<string, ArrRateLimiter>()

export function getRateLimiter(instanceId: string): ArrRateLimiter {
  let limiter = pool.get(instanceId)
  if (!limiter) {
    limiter = new ArrRateLimiter()
    pool.set(instanceId, limiter)
  }
  return limiter
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
