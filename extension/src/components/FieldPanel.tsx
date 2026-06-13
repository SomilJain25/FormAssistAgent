import React, { useState } from 'react'
import { DetectedField } from '../content/contentScript'

interface FieldPanelProps {
  fields: DetectedField[]
  isScanning: boolean
  lastScanned: Date | null
  onScan: () => void
  onClear: () => void
}

// Badge color per field type
const TYPE_COLORS: Record<string, string> = {
  text:     '#4a90d9',
  email:    '#7b68ee',
  tel:      '#20b2aa',
  number:   '#ff8c00',
  date:     '#da70d6',
  password: '#dc143c',
  textarea: '#3cb371',
  select:   '#cd853f',
  radio:    '#ff69b4',
  checkbox: '#778899',
}

const FieldBadge: React.FC<{ type: string }> = ({ type }) => (
  <span
    className="field-type-badge"
    style={{ background: TYPE_COLORS[type] || '#888' }}
  >
    {type}
  </span>
)

const FieldPanel: React.FC<FieldPanelProps> = ({
  fields, isScanning, lastScanned, onScan, onClear
}) => {
  const [expanded, setExpanded] = useState<number | null>(null)

  return (
    <div className="field-panel">
      {/* Panel header */}
      <div className="panel-header">
        <span className="panel-title">
          🔍 Detected Fields
          {fields.length > 0 && (
            <span className="field-count">{fields.length}</span>
          )}
        </span>
        <div className="panel-actions">
          {fields.length > 0 && (
            <button className="btn-icon" onClick={onClear} title="Clear">✕</button>
          )}
          <button
            className="btn-scan"
            onClick={onScan}
            disabled={isScanning}
          >
            {isScanning ? '⏳ Scanning...' : '🔍 Scan Page'}
          </button>
        </div>
      </div>

      {/* Last scanned time */}
      {lastScanned && (
        <p className="scan-time">
          Last scanned: {lastScanned.toLocaleTimeString()}
        </p>
      )}

      {/* Field list */}
      {fields.length === 0 && !isScanning && (
        <p className="no-fields">
          Click "Scan Page" while on a page with a form.
        </p>
      )}

      <div className="field-list">
        {fields.map((field) => (
          <div
            key={field.fieldId}
            className={`field-item ${expanded === field.index ? 'field-item-expanded' : ''}`}
            onClick={() => setExpanded(expanded === field.index ? null : field.index)}
          >
            {/* Summary row */}
            <div className="field-summary">
              <FieldBadge type={field.type} />
              <span className="field-label">
                {field.label || field.placeholder || field.name || field.id || '(unlabeled)'}
              </span>
              <span className="field-chevron">
                {expanded === field.index ? '▲' : '▼'}
              </span>
            </div>

            {/* Expanded detail */}
            {expanded === field.index && (
              <div className="field-detail">
                <DetailRow label="Label"       value={field.label} />
                <DetailRow label="Placeholder" value={field.placeholder} />
                <DetailRow label="Name"        value={field.name} />
                <DetailRow label="ID"          value={field.id} />
                <DetailRow label="Tag"         value={field.tagName} />
                <DetailRow label="Type"        value={field.type} />
                {field.value && <DetailRow label="Current" value={field.value} />}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  if (!value) return null
  return (
    <div className="detail-row">
      <span className="detail-label">{label}:</span>
      <span className="detail-value">{value}</span>
    </div>
  )
}

export default FieldPanel