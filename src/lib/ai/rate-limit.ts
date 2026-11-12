// Temporary, in-memory rate limiter for the AI preview endpoint.
//
// This resets on every server restart/redeploy and does not share state
// across multiple serverless instances — a known limitation, acceptable
// for pilot-scale traffic. It exists so a customer mashing "다시 생성"
// can't run up an unbounded OpenAI bill; revisit with a durable,
// per-customer counter (keyed off the anonymous-auth user id, in a
// Supabase table) once traffic actually warrants it.

const WINDOW_MS = 60 * 60 * 1000 // 1 hour
const MAX_REQUESTS_PER_WINDOW = 10

interface Bucket {
  count: number
  windowStart: number
}

const buckets = new Map<string, Bucket>()

export interface RateLimitResult {
  allowed: boolean
  remaining: number
}

export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now })
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1 }
  }

  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, remaining: 0 }
  }

  bucket.count += 1
  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - bucket.count }
}

export function getClientKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim()
  }
  return "local-dev"
}

export const RATE_LIMIT_MAX_REQUESTS_PER_WINDOW = MAX_REQUESTS_PER_WINDOW
