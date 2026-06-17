import React, { useState } from 'react'
import { MappingResult } from '../services/api'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReviewStatus = 'pending' | 'approved' | 'editing' | 'rejected'

export interface ReviewItem {
  mapping: MappingResult
  status: ReviewStatus
  editedValue: string   // may differ from mapping.entity_value
}

interface ReviewPanelProps {
  items: ReviewItem[]
  onItemChange: (fieldId: string, status: ReviewStatus, editedValue?: string) => void
  onApproveAll: () => void
  onFillApproved: () => void
  isFilling: boolean
  fillResult: { success: number; failed: number } | null
}

// ─── Confidence badge ─────────────────────────────────────────────────────────

const ConfidenceBadge: React.FC<{ score: number }> = ({ score }) => {
  const pct = Math.round(score * 100)
  const color = pct >= 90 ? '#2e7d32' : pct >= 70 ? '#f57f17' : '#c62828'
  return (
    <span className="conf-badge" style={{ background: color }}>
      {pct}%
    </span>
  )
}

// ─── Single review row ────────────────────────────────────────────────────────

const ReviewRow: React.FC<{
  item: ReviewItem
  onChange: (status: ReviewStatus, editedValue?: string) => void
}> = ({ item, onChange }) => {
  const { mapping, status, editedValue } = item
  const [draftValue, setDraftValue] = useState(editedValue)

  const rowClass = {
    pending:  'review-row',
    approved: 'review-row row-approved',
    editing:  'review-row row-editing',
    rejected: 'review-row row-rejected',
  }[status]

  return (
    <div className={rowClass}>
      {/* Left — entity info */}
      <div className="review-left">
        <div className="review-entity-type">{mapping.entity_type}</div>
        <div className="review-field-label">
          → {mapping.field_label || mapping.field_id || '(unknown field)'}
        </div>
      </div>

      {/* Centre — value (editable or display) */}
      <div className="review-centre">
        {status === 'editing' ? (
          <input
            className="review-edit-input"
            value={draftValue}
            autoFocus
            onChange={e => setDraftValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') onChange('approved', draftValue)
              if (e.key === 'Escape') onChange('pending', editedValue)
            }}
          />
        ) : (
          <span className={`review-value ${status === 'rejected' ? 'review-value-rejected' : ''}`}>
            {editedValue}
          </span>
        )}
      </div>

      {/* Right — confidence + action buttons */}
      <div className="review-right">
        <ConfidenceBadge score={mapping.confidence} />

        <div className="review-actions">
          {status === 'editing' ? (
            <>
              <button
                className="action-btn action-save"
                title="Save"
                onClick={() => onChange('approved', draftValue)}
              >✓</button>
              <button
                className="action-btn action-cancel"
                title="Cancel"
                onClick={() => onChange('pending', editedValue)}
              >✕</button>
            </>
          ) : (
            <>
              {status !== 'approved' && (
                <button
                  className="action-btn action-approve"
                  title="Approve"
                  onClick={() => onChange('approved')}
                >✓</button>
              )}
              <button
                className="action-btn action-edit"
                title="Edit value"
                onClick={() => {
                  setDraftValue(editedValue)
                  onChange('editing')
                }}
              >✎</button>
              {status !== 'rejected' ? (
                <button
                  className="action-btn action-reject"
                  title="Reject"
                  onClick={() => onChange('rejected')}
                >✕</button>
              ) : (
                <button
                  className="action-btn action-restore"
                  title="Restore"
                  onClick={() => onChange('pending')}
                >↺</button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Review Panel ────────────────────────────────────────────────────────

const ReviewPanel: React.FC<ReviewPanelProps> = ({
  items,
  onItemChange,
  onApproveAll,
  onFillApproved,
  isFilling,
  fillResult,
}) => {
  const approvedCount = items.filter(i => i.status === 'approved').length
  const rejectedCount = items.filter(i => i.status === 'rejected').length
  const pendingCount  = items.filter(i => i.status === 'pending' || i.status === 'editing').length

  return (
    <div className="review-panel">
      {/* Header */}
      <div className="review-header">
        <span className="review-title">📝 Review Mappings</span>
        <div className="review-stats">
          {approvedCount > 0 && (
            <span className="stat stat-approved">✓ {approvedCount}</span>
          )}
          {rejectedCount > 0 && (
            <span className="stat stat-rejected">✕ {rejectedCount}</span>
          )}
          {pendingCount > 0 && (
            <span className="stat stat-pending">◌ {pendingCount}</span>
          )}
        </div>
      </div>

      {/* Bulk action */}
      {pendingCount > 0 && (
        <button className="btn-approve-all" onClick={onApproveAll}>
          ✓ Approve all pending ({pendingCount})
        </button>
      )}

      {/* Legend */}
      <div className="review-legend">
        <span>✓ Approve</span>
        <span>✎ Edit</span>
        <span>✕ Reject</span>
      </div>

      {/* Rows */}
      <div className="review-list">
        {items.map(item => (
          <ReviewRow
            key={item.mapping.field_id || item.mapping.entity_type}
            item={item}
            onChange={(status, editedValue) =>
              onItemChange(
                item.mapping.field_id,
                status,
                editedValue ?? item.editedValue,
              )
            }
          />
        ))}
      </div>

      {/* Fill button */}
      {approvedCount > 0 && (
        <button
          className="btn-fill-approved"
          onClick={onFillApproved}
          disabled={isFilling}
        >
          {isFilling
            ? '✍️ Filling...'
            : `✍️ Fill ${approvedCount} approved field${approvedCount !== 1 ? 's' : ''}`
          }
        </button>
      )}

      {/* Fill result */}
      {fillResult && (
        <div className={`fill-result ${fillResult.failed === 0 ? 'fill-success' : 'fill-partial'}`}>
          {fillResult.failed === 0
            ? `✅ ${fillResult.success} field${fillResult.success !== 1 ? 's' : ''} filled!`
            : `⚠️ ${fillResult.success} filled, ${fillResult.failed} failed`
          }
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <p className="review-empty">
          No mappings to review yet. Go to the Speech tab, speak, then click Extract + Map.
        </p>
      )}
    </div>
  )
}

export default ReviewPanel
export type { ReviewPanelProps }