import { z } from "zod"

// Single source of truth for every environment variable this app reads.
// Validated once, at first import, so a missing/empty value fails loudly
// here — with the exact variable name — instead of surfacing later as an
// opaque error deep inside a third-party SDK (e.g. Supabase's own
// "supabaseUrl is required.", which gives no indication of *which* env
// var or *where* it was read from).
const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().trim().min(1, "NEXT_PUBLIC_SUPABASE_URL is required"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().trim().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  OPENAI_API_KEY: z.string().trim().min(1, "OPENAI_API_KEY is required"),
  TOSS_SECRET_KEY: z.string().trim().min(1, "TOSS_SECRET_KEY is required"),
  NEXT_PUBLIC_TOSS_CLIENT_KEY: z.string().trim().min(1, "NEXT_PUBLIC_TOSS_CLIENT_KEY is required"),
  NEXT_PUBLIC_SITE_URL: z.string().trim().url().optional(),
})

function loadEnv() {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    const missing = result.error.issues.map((issue) => issue.path.join(".")).join(", ")
    // Thrown at import time, not call time — this module must be the
    // first thing every server entrypoint imports (see
    // src/lib/supabase/*.ts), so the failure happens at the earliest
    // possible point, with every missing variable named at once.
    throw new Error(
      `[env] Missing or empty required environment variable(s): ${missing}. ` +
        `Check .env.local (dev) or the deployment platform's project settings (production) — ` +
        `and if this is Vercel, confirm the variable is scoped to the environment you're actually hitting.`
    )
  }
  return result.data
}

export const env = loadEnv()
