// Server-only. Normalizes an arbitrary uploaded image to a web-safe,
// right-sized JPEG so nothing downstream has to care what the browser did
// or didn't manage to encode. Decodes HEIC via a pure-JS libheif build (no
// native platform package, so it works on serverless runtimes) and
// everything else via sharp, then always emits image/jpeg.
import convertHeic from "heic-convert"
import sharp from "sharp"

export const NORMALIZED_MAX_EDGE = 1600
const JPEG_QUALITY = 82

export interface NormalizedImage {
  buffer: Buffer
  contentType: "image/jpeg"
  extension: "jpg"
}

const HEIC_BRANDS = new Set([
  "heic", "heix", "heim", "heis",
  "hevc", "hevx", "hevm", "hevs",
  "mif1", "msf1", "heif",
])

// HEIC/HEIF containers are ISO base media files: bytes 4..8 are the "ftyp"
// box tag and bytes 8..12 are the major brand. Phone pickers frequently
// report these files with an empty or wrong MIME type, so sniff the bytes
// instead of trusting the declared type.
export function looksLikeHeic(buffer: Buffer): boolean {
  if (buffer.length < 12) return false
  if (buffer.toString("latin1", 4, 8) !== "ftyp") return false
  const brand = buffer.toString("latin1", 8, 12).toLowerCase()
  return HEIC_BRANDS.has(brand)
}

export async function normalizeToJpeg(input: Buffer): Promise<NormalizedImage> {
  const source = looksLikeHeic(input)
    ? Buffer.from(await convertHeic({ buffer: input, format: "JPEG", quality: 1 }))
    : input

  const buffer = await sharp(source)
    .rotate() // apply EXIF orientation, then strip it
    .resize({ width: NORMALIZED_MAX_EDGE, height: NORMALIZED_MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer()

  return { buffer, contentType: "image/jpeg", extension: "jpg" }
}
