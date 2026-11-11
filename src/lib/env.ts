import { z } from "zod"

// Single source of truth for every environment variable this app reads.
// Validated lazily, the first time getEnv() is actually CALLED (inside a
// route handler at request time) — not at module import time. Next.js's
// build process imports every route file to collect its config during
// `next build`, even when nothing in the route actually runs yet; a
// top-level `export const env = loadEnv()` evaluated at import time was
// tried first and broke the build itself whenever secrets weren't present
// at build time (a normal setup — many platforms inject runtime secrets
// separately from the build step). Lazy evaluation keeps the real
// benefit — failing loudly with the exact missing variable name, instead
// of an opaque SDK error like Supabase's own "supabaseUrl is required." —
// without that build-time coupling.
const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().trim().min(1, "NEXT_PUBLIC_SUPABASE_URL is required"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().trim().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  OPENAI_API_KEY: z.string().trim().min(1, "OPENAI_API_KEY is required"),
  TOSS_SECRET_KEY: z.string().trim().min(1, "TOSS_SECRET_KEY is required"),
  NEXT_PUBLIC_TOSS_CLIENT_KEY: z.string().trim().min(1, "NEXT_PUBLIC_TOSS_CLIENT_KEY is required"),
  NEXT_PUBLIC_SITE_URL: z.string().trim().url().optional(),
})

type Env = z.infer<typeof envSchema>

let cached: Env | null = null

export function getEnv(): Env {
  if (cached) return cached

  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    const missing = result.error.issues.map((issue) => issue.path.join(".")).join(", ")
    throw new Error(
      `[env] Missing or empty required environment variable(s): ${missing}. ` +
        `Check .env.local (dev) or the deployment platform's project settings (production) — ` +
        `and if this is Vercel, confirm the variable is scoped to the environment you're actually hitting.`
    )
  }
  cached = result.data
  return cached
}
