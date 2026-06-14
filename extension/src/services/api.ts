// api.ts — calls the FastAPI backend from the extension

const API_BASE = 'http://localhost:8000/api/v1'

export interface Entity {
  entity_type: string
  value: string
  normalized: string
  confidence: number
  raw_text: string
}

export interface ExtractResponse {
  success: boolean
  transcript: string
  entities: Entity[]
  entity_map: Record<string, string>
  message: string
}

export async function extractEntities(text: string): Promise<ExtractResponse> {
  const response = await fetch(`${API_BASE}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language: 'en' }),
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  return response.json()
}