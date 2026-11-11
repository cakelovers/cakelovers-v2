import { getOpenAIClient } from "./client"

export interface CakePreviewResult {
  image: string // data: URL (base64)
  prompt: string
}

const SYSTEM_STYLE_PROMPT =
  "A professional, photorealistic studio photo of a custom-decorated cake, " +
  "soft natural lighting, shallow depth of field, on a simple neutral background. " +
  "Cake design: "

// Stateless text-to-image. Nothing persisted here — the caller is
// responsible for storing whichever candidate the customer selects, at
// order-submission time.
export async function generateCakePreview(description: string): Promise<CakePreviewResult> {
  const client = getOpenAIClient()
  const prompt = `${SYSTEM_STYLE_PROMPT}${description}`

  const result = await client.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1024x1024",
    quality: "medium",
    n: 1,
  })

  const b64 = result.data?.[0]?.b64_json
  if (!b64) {
    throw new Error("OpenAI image generation returned no image data")
  }

  return {
    image: `data:image/png;base64,${b64}`,
    prompt,
  }
}
