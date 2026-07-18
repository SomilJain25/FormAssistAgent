// api.ts

// Switch between local dev and production automatically
const isDev = false  // ← flip this to true for local testing

const API_BASE = isDev
  ? 'http://localhost:8000/api/v1'
  : 'https://formassistagent.onrender.com'  // ← your real URL

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
  const res = await fetch(`${API_BASE}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language }),
  })
  if (!res.ok) throw new Error(`Extract API error: ${res.status}`)
  return res.json()
}

export async function mapEntitiesToFields(
  entities: Entity[],
  fields: object[],
): Promise<MapResponse> {
  const res = await fetch(`${API_BASE}/map`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entities, fields }),
  })
  if (!res.ok) throw new Error(`Map API error: ${res.status}`)
  return res.json()
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
  const res = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entities, fields, template }),
  })
  if (!res.ok) throw new Error(`Analyze API error: ${res.status}`)
  return res.json()
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
  bbox?: number[][]
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

  const res = await fetch(`${API_BASE}/ocr/parse`, {
    method: 'POST',
    body: formData,   // no Content-Type header — browser sets multipart boundary
  })

  if (!res.ok) throw new Error(`OCR API error: ${res.status}`)
  return res.json()
}