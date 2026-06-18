const API_BASE = 'http://localhost:8000/api/v1'

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