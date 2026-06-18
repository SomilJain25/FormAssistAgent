import React, { useState } from 'react'
import { UserProfile, ProfileField, ENTITY_LABELS, ENTITY_ICONS } from '../services/profileStorage'

interface ProfileTabProps {
  profile: UserProfile | null
  isLoading: boolean
  isSaving: boolean
  onUpdate: (key: string, value: string) => Promise<void>
  onDelete: (key: string) => Promise<void>
  onClearAll: () => Promise<void>
  onFillFromProfile: () => void
}

// ── Single profile field row ──────────────────────────────────────────────────

const ProfileRow: React.FC<{
  field: ProfileField
  onUpdate: (key: string, value: string) => Promise<void>
  onDelete: (key: string) => Promise<void>
}> = ({ field, onUpdate, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft]         = useState(field.value)

  const handleSave = async () => {
    if (draft.trim()) {
      await onUpdate(field.key, draft.trim())
    }
    setIsEditing(false)
  }

  const updatedDate = new Date(field.updatedAt).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })

  return (
    <div className="profile-row">
      <div className="profile-icon">
        {ENTITY_ICONS[field.key] || '📄'}
      </div>

      <div className="profile-content">
        <div className="profile-label">{field.label}</div>

        {isEditing ? (
          <input
            className="profile-edit-input"
            value={draft}
            autoFocus
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  handleSave()
              if (e.key === 'Escape') setIsEditing(false)
            }}
          />
        ) : (
          <div className="profile-value">{field.value}</div>
        )}

        <div className="profile-meta">
          Used {field.useCount}× · Updated {updatedDate}
        </div>
      </div>

      <div className="profile-actions">
        {isEditing ? (
          <>
            <button
              className="profile-btn profile-btn-save"
              onClick={handleSave}
            >✓</button>
            <button
              className="profile-btn profile-btn-cancel"
              onClick={() => setIsEditing(false)}
            >✕</button>
          </>
        ) : (
          <>
            <button
              className="profile-btn profile-btn-edit"
              onClick={() => { setDraft(field.value); setIsEditing(true) }}
              title="Edit"
            >✎</button>
            <button
              className="profile-btn profile-btn-delete"
              onClick={() => onDelete(field.key)}
              title="Delete"
            >🗑</button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Add new field form ────────────────────────────────────────────────────────

const AddFieldForm: React.FC<{
  existingKeys: string[]
  onAdd: (key: string, value: string) => Promise<void>
}> = ({ existingKeys, onAdd }) => {
  const [isOpen, setIsOpen]   = useState(false)
  const [key, setKey]         = useState('')
  const [value, setValue]     = useState('')

  const availableKeys = Object.keys(ENTITY_LABELS).filter(
    k => !existingKeys.includes(k)
  )

  const handleAdd = async () => {
    if (key && value.trim()) {
      await onAdd(key, value.trim())
      setKey(''); setValue(''); setIsOpen(false)
    }
  }

  if (!isOpen) {
    return (
      <button className="btn-add-field" onClick={() => setIsOpen(true)}>
        + Add field manually
      </button>
    )
  }

  return (
    <div className="add-field-form">
      <select
        className="lang-select"
        value={key}
        onChange={e => setKey(e.target.value)}
      >
        <option value="">Select field type...</option>
        {availableKeys.map(k => (
          <option key={k} value={k}>
            {ENTITY_ICONS[k]} {ENTITY_LABELS[k]}
          </option>
        ))}
      </select>

      <input
        className="profile-edit-input"
        placeholder="Enter value..."
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
      />

      <div className="add-field-actions">
        <button className="btn btn-primary" style={{ flex: 1, padding: '7px' }} onClick={handleAdd}>
          Add
        </button>
        <button className="btn btn-secondary" style={{ flex: 1, padding: '7px' }} onClick={() => setIsOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Main Profile Tab ──────────────────────────────────────────────────────────

const ProfileTab: React.FC<ProfileTabProps> = ({
  profile,
  isLoading,
  isSaving,
  onUpdate,
  onDelete,
  onClearAll,
  onFillFromProfile,
}) => {
  const [confirmClear, setConfirmClear] = useState(false)

  if (isLoading) {
    return (
      <div className="profile-loading">
        <div className="spinner" />
        Loading profile...
      </div>
    )
  }

  const fields = profile ? Object.values(profile.fields) : []

  // Sort by use count descending
  const sortedFields = [...fields].sort((a, b) => b.useCount - a.useCount)

  const lastUpdated = profile?.lastUpdated
    ? new Date(profile.lastUpdated).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    : null

  return (
    <div className="profile-tab">
      {/* Header */}
      <div className="profile-header">
        <div>
          <div className="profile-title">👤 My Profile</div>
          {lastUpdated && (
            <div className="profile-subtitle">
              {fields.length} saved · Updated {lastUpdated}
            </div>
          )}
        </div>
        {isSaving && <span className="saving-badge">💾 Saving...</span>}
      </div>

      {/* Fill from profile button */}
      {fields.length > 0 && (
        <button className="btn-fill-profile" onClick={onFillFromProfile}>
          ⚡ Fill Form from Profile
        </button>
      )}

      {/* Field list */}
      {sortedFields.length === 0 ? (
        <div className="profile-empty">
          <div className="profile-empty-icon">👤</div>
          <p>No profile data yet.</p>
          <p>Fill a form using voice — your details will be saved automatically.</p>
        </div>
      ) : (
        <div className="profile-list">
          {sortedFields.map(field => (
            <ProfileRow
              key={field.key}
              field={field}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {/* Add field manually */}
      <AddFieldForm
        existingKeys={fields.map(f => f.key)}
        onAdd={onUpdate}
      />

      {/* Clear all */}
      {fields.length > 0 && (
        confirmClear ? (
          <div className="confirm-clear">
            <span className="confirm-text">Delete all profile data?</span>
            <button
              className="profile-btn profile-btn-delete"
              onClick={async () => { await onClearAll(); setConfirmClear(false) }}
            >Yes, clear</button>
            <button
              className="profile-btn profile-btn-cancel"
              onClick={() => setConfirmClear(false)}
            >Cancel</button>
          </div>
        ) : (
          <button className="btn-clear-profile" onClick={() => setConfirmClear(true)}>
            🗑️ Clear all profile data
          </button>
        )
      )}
    </div>
  )
}

export default ProfileTab