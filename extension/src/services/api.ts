// api.ts — client for the FormAssist backend (FastAPI on Render)

// Override at build time:  VITE_API_BASE=http://localhost:8000/api/v1 npm run build
const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ||
  'https://formassistagent.onrender.com/api/v1'

// Render's free tier sleeps after ~15 min idle; the first request can take
// 30-60 s while the container boots, so use a generous timeout + one retry.
const REQUEST_TIMEOUT_MS = 70_000

async function request(path: string, init: RequestInit, retries = 1): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const res = await fetch(`${API_BASE}${path}`, { ...init, signal: controller.signal })
      // 502/503/504 = Render still waking up → retry
      if ([502, 503, 504].includes(res.status) && attempt < retries) {
        await new Promise(r => setTimeout(r, 4000))
        continue
      }
      return res
    } catch (err) {
      lastError = err
      if (attempt < retries) await new Promise(r => setTimeout(r, 3000))
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Network error')
}

async function postJson<T>(path: string, body: unknown, label: string): Promise<T> {
  const res = await request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${label} API error: ${res.status}`)
  return res.json()
}

/** Fire-and-forget ping so a sleeping Render instance starts booting early. */
export function wakeBackend(): void {
  const root = API_BASE.replace(/\/api\/v1$/, '')
  fetch(`${root}/health`).catch(() => {})
}

export interface Entity {
  entity_type: string
  value: string
  normalized: string
  confidence: number
  raw_text: string
}

export interface MappingResult {
  entity_type: string
  entity_value: string
  field_id: string
  field_label: string
  field_type: string
  confidence: number
  matched: boolean
}

export interface ExtractResponse {
  success: boolean
  transcript: string
  entities: Entity[]
  entity_map: Record<string, string>
  detected_language: string
  message: string
}

export interface MapResponse {
  success: boolean
  mappings: MappingResult[]
  matched_count: number
  unmatched_count: number
  message: string
}

export async function extractEntities(
  text: string,
  language: string = 'auto',
): Promise<ExtractResponse> {
  return postJson<ExtractResponse>('/extract', { text, language }, 'Extract')
}

export async function mapEntitiesToFields(
  entities: Entity[],
  fields: object[],
): Promise<MapResponse> {
  return postJson<MapResponse>('/map', { entities, fields }, 'Map')
}

// Add to existing file

export interface ValidationResult {
  entity_type: string
  is_valid: boolean
  suggestion: string
}

export interface CompletionStats {
  total_fields: number
  filled_fields: number
  percentage: number
  status: 'complete' | 'mostly_complete' | 'partial' | 'minimal'
}

export interface AnalyzeResponse {
  success: boolean
  validations: ValidationResult[]
  missing_fields: string[]
  completion: CompletionStats
  ambiguous_entities: string[]
  message: string
}

export async function analyzeForm(
  entities: Entity[],
  fields: object[],
  template: 'common' | 'scholarship' = 'common',
): Promise<AnalyzeResponse> {
  return postJson<AnalyzeResponse>('/analyze', { entities, fields, template }, 'Analyze')
}

// Add to existing file

export interface OCRField {
  index: number
  fieldId: string
  label: string
  placeholder: string
  name: string
  id: string
  type: string
  tagName: string
  value: string
  confidence: number
  bbox?: number[][] | null
}

export interface OCRParseResponse {
  success: boolean
  fields: OCRField[]
  raw_text: string
  total_text_boxes: number
  fields_detected: number
  pages_processed: number
  message: string
}

export async function parseOCRForm(file: File): Promise<OCRParseResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const res = await request('/ocr/parse', {
    method: 'POST',
    body: formData,   // no Content-Type header — browser sets multipart boundary
  })

  if (!res.ok) throw new Error(`OCR API error: ${res.status}`)
  return res.json()
}