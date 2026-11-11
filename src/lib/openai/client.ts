import OpenAI from "openai"
import { getEnv } from "@/lib/env"

let cachedClient: OpenAI | null = null

// Shared across every OpenAI-calling module — one client instance.
export function getOpenAIClient(): OpenAI {
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: getEnv().OPENAI_API_KEY })
  }
  return cachedClient
}
