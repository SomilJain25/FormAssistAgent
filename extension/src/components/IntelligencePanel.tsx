import React from 'react'
import { AnalyzeResponse } from '../services/api'
import { ENTITY_LABELS, ENTITY_ICONS } from '../services/profileStorage'

interface IntelligencePanelProps {
  analysis: AnalyzeResponse | null
  isAnalyzing: boolean
}

// ── Completion ring ────────────────────────────────────────────────────────────

const CompletionRing: React.FC<{ percentage: number; status: string }> = ({ percentage, status }) => {
  const color = {
    complete:        '#2e7d32',
    mostly_complete: '#1976d2',
    partial:         '#f57f17',
    minimal:         '#c62828',
  }[status] || '#888'

  const circumference = 2 * Math.PI * 26
  const offset = circumference - (percentage / 100) * circumference

  return (
    <div className="completion-ring-wrap">
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="26" fill="none" stroke="#eee" strokeWidth="6" />
        <circle
          cx="32" cy="32" r="26" fill="none"
          stroke={color} strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 32 32)"
        />
        <text x="32" y="37" textAnchor="middle" fontSize="14" fontWeight="600" fill={color}>
          {percentage}%
        </text>
      </svg>
    </div>
  )
}

const STATUS_LABELS: Record<string, string> = {
  complete:        'Form complete',
  mostly_complete: 'Mostly complete',
  partial:         'Partially filled',
  minimal:         'Just getting started',
}

const IntelligencePanel: React.FC<IntelligencePanelProps> = ({ analysis, isAnalyzing }) => {
  if (isAnalyzing) {
    return (
      <div className="intel-loading">
        <div className="spinner" /> Analyzing form...
      </div>
    )
  }

  if (!analysis) {
    return (
      <p className="intel-empty">
        Run "Extract & Review" first, then analysis will appear here.
      </p>
    )
  }

  const { completion, missing_fields, ambiguous_entities, validations } = analysis
  const invalidFields = validations.filter(v => !v.is_valid)

  return (
    <div className="intel-panel">
      {/* Completion */}
      <div className="completion-card">
        <CompletionRing percentage={completion.percentage} status={completion.status} />
        <div className="completion-info">
          <div className="completion-status">{STATUS_LABELS[completion.status]}</div>
          <div className="completion-detail">
            {completion.filled_fields} of {completion.total_fields} fields filled
          </div>
        </div>
      </div>

      {/* Validation errors */}
      {invalidFields.length > 0 && (
        <div className="intel-section">
          <p className="intel-section-title">⚠️ Needs attention</p>
          {invalidFields.map(v => (
            <div key={v.entity_type} className="intel-issue-row">
              <span className="intel-issue-icon">{ENTITY_ICONS[v.entity_type] || '📄'}</span>
              <div className="intel-issue-content">
                <div className="intel-issue-label">{ENTITY_LABELS[v.entity_type] || v.entity_type}</div>
                <div className="intel-issue-suggestion">{v.suggestion}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ambiguous entities */}
      {ambiguous_entities.length > 0 && (
        <div className="intel-section">
          <p className="intel-section-title">🤔 Low confidence — please verify</p>
          <div className="ambiguous-chips">
            {ambiguous_entities.map(type => (
              <span key={type} className="ambiguous-chip">
                {ENTITY_ICONS[type] || '📄'} {ENTITY_LABELS[type] || type}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Missing fields */}
      {missing_fields.length > 0 && (
        <div className="intel-section">
          <p className="intel-section-title">📋 Possibly missing</p>
          <div className="missing-chips">
            {missing_fields.map(type => (
              <span key={type} className="missing-chip">
                {ENTITY_ICONS[type] || '📄'} {ENTITY_LABELS[type] || type}
              </span>
            ))}
          </div>
          <p className="intel-hint">
            💡 Try mentioning these in your next voice input.
          </p>
        </div>
      )}

      {/* All good */}
      {invalidFields.length === 0 && ambiguous_entities.length === 0 && missing_fields.length === 0 && (
        <div className="intel-all-good">
          ✅ Everything looks good! No issues detected.
        </div>
      )}
    </div>
  )
}

export default IntelligencePanel