import { useState, useCallback } from 'react'
import type { MappingResult } from '../services/api'
import type { ReviewItem, ReviewStatus } from '../components/ReviewPanel'
import { sendToActiveTab } from '../services/tabMessaging'

interface ReviewState {
  items: ReviewItem[]
  isFilling: boolean
  fillResult: { success: number; failed: number } | null
}

interface ReviewControls {
  loadMappings: (mappings: MappingResult[]) => void
  updateItem: (fieldId: string, status: ReviewStatus, editedValue?: string) => void
  approveAll: () => void
  fillApproved: () => void
  clearReview: () => void
}

const useReview = (): ReviewState & ReviewControls => {
  const [items, setItems]           = useState<ReviewItem[]>([])
  const [isFilling, setIsFilling]   = useState(false)
  const [fillResult, setFillResult] = useState<{ success: number; failed: number } | null>(null)

  // Load new mappings into review state
  // Auto-approve high-confidence (≥0.90), leave others as pending
  const loadMappings = useCallback((mappings: MappingResult[]) => {
    const reviewItems: ReviewItem[] = mappings
      .filter(m => m.matched)
      .map(m => ({
        mapping: m,
        status: m.confidence >= 0.90 ? 'approved' : 'pending' as ReviewStatus,
        editedValue: m.entity_value,
      }))
    setItems(reviewItems)
    setFillResult(null)
  }, [])

  const updateItem = useCallback((
    fieldId: string,
    status: ReviewStatus,
    editedValue?: string,
  ) => {
    setItems(prev => prev.map(item =>
      item.mapping.field_id === fieldId
        ? {
            ...item,
            status,
            editedValue: editedValue !== undefined ? editedValue : item.editedValue,
          }
        : item
    ))
  }, [])

  const approveAll = useCallback(() => {
    setItems(prev => prev.map(item =>
      item.status === 'pending' || item.status === 'editing'
        ? { ...item, status: 'approved' }
        : item
    ))
  }, [])

  const fillApproved = useCallback(() => {
    const approved = items.filter(i => i.status === 'approved')
    if (!approved.length) return

    setIsFilling(true)
    setFillResult(null)

    const instructions = approved.map(i => ({
      fieldId: i.mapping.field_id,
      value: i.editedValue,
    }))

    sendToActiveTab<{ results?: { success: boolean }[] }>('FILL_FIELDS', { instructions })
      .then(res => {
        const results = res?.results || []
        setFillResult({
          success: results.filter(r => r.success).length,
          failed:  results.filter(r => !r.success).length,
        })
      })
      .catch(() => setFillResult({ success: 0, failed: instructions.length }))
      .finally(() => setIsFilling(false))
  }, [items])

  const clearReview = useCallback(() => {
    setItems([])
    setFillResult(null)
  }, [])

  return {
    items,
    isFilling,
    fillResult,
    loadMappings,
    updateItem,
    approveAll,
    fillApproved,
    clearReview,
  }
}

export default useReview