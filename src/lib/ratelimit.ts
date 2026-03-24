import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Standard limit: 60 requests per minute (vessel, anomalies, port endpoints)
export const standardRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  analytics: false,
  prefix: 'thalweg:standard',
})

// Strict limit: 10 requests per minute (spill predictor — compute intensive)
export const spillRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  analytics: false,
  prefix: 'thalweg:spill',
})

// Helper: extract client IP from Next.js request
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return 'unknown'
}
