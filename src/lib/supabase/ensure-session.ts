"use client"

import { createClient } from "./client"

// Browser-only. Guest customers get a real Supabase session via Anonymous
// Auth — no email/password, invisible to the customer — so every RLS
// check (customers.auth_user_id = auth.uid(), etc.) has a real identity to
// key off. Safe to call repeatedly: a no-op once a session already exists.
export async function ensureAnonymousSession() {
  const supabase = createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session) return session

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  return data.session
}
