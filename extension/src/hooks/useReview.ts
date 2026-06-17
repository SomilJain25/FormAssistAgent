import { useState, useCallback } from 'react'
import { MappingResult } from '../services/api'
import { ReviewItem, ReviewStatus } from '../components/ReviewPanel'

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

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id
      if (!tabId) { setIsFilling(false); return }

      chrome.tabs.sendMessage(
        tabId,
        { type: 'FILL_FIELDS', instructions },
        (res) => {
          setIsFilling(false)
          if (chrome.runtime.lastError || !res) return
          const results = res.results || []
          setFillResult({
            success: results.filter((r: any) => r.success).length,
            failed:  results.filter((r: any) => !r.success).length,
          })
        }
      )
    })
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