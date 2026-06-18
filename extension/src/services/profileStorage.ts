// profileStorage.ts
// Manages user profile data using Chrome Storage API.
// Data persists across browser sessions automatically.

export interface ProfileField {
  key: string           // entity_type e.g. "name"
  value: string         // e.g. "Somil Jain"
  label: string         // human readable e.g. "Full Name"
  updatedAt: string     // ISO date string
  useCount: number      // how many times this was used
}

export interface UserProfile {
  fields: Record<string, ProfileField>
  lastUpdated: string
  version: number
}

// Human-readable labels for each entity type
export const ENTITY_LABELS: Record<string, string> = {
  name:         'Full Name',
  father_name:  "Father's Name",
  mother_name:  "Mother's Name",
  email:        'Email Address',
  phone:        'Phone Number',
  dob:          'Date of Birth',
  income:       'Annual Income',
  address:      'Address',
  city:         'City',
  state:        'State',
  pincode:      'PIN Code',
  gender:       'Gender',
  category:     'Category',
  nationality:  'Nationality',
  religion:     'Religion',
}

// Icons for each entity type
export const ENTITY_ICONS: Record<string, string> = {
  name:         '👤',
  father_name:  '👨',
  mother_name:  '👩',
  email:        '📧',
  phone:        '📱',
  dob:          '🎂',
  income:       '💰',
  address:      '🏠',
  city:         '🏙️',
  state:        '🗺️',
  pincode:      '📮',
  gender:       '⚧',
  category:     '🏷️',
  nationality:  '🌐',
  religion:     '🕌',
}

const STORAGE_KEY = 'voice_form_assistant_profile'

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getProfile(): Promise<UserProfile> {
  return new Promise(resolve => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      const stored = result[STORAGE_KEY]
      if (stored) {
        resolve(stored as UserProfile)
      } else {
        resolve({ fields: {}, lastUpdated: new Date().toISOString(), version: 1 })
      }
    })
  })
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function saveProfile(profile: UserProfile): Promise<void> {
  return new Promise(resolve => {
    chrome.storage.local.set({ [STORAGE_KEY]: profile }, resolve)
  })
}

// ── Update single field ───────────────────────────────────────────────────────

export async function upsertProfileField(
  key: string,
  value: string,
): Promise<void> {
  const profile = await getProfile()
  const existing = profile.fields[key]

  profile.fields[key] = {
    key,
    value,
    label: ENTITY_LABELS[key] || key,
    updatedAt: new Date().toISOString(),
    useCount: existing ? existing.useCount + 1 : 1,
  }

  profile.lastUpdated = new Date().toISOString()
  await saveProfile(profile)
}

// ── Bulk update from entities ─────────────────────────────────────────────────

export async function saveEntitiesToProfile(
  entities: { entity_type: string; normalized: string }[],
): Promise<void> {
  const profile = await getProfile()

  entities.forEach(entity => {
    const existing = profile.fields[entity.entity_type]
    profile.fields[entity.entity_type] = {
      key:       entity.entity_type,
      value:     entity.normalized,
      label:     ENTITY_LABELS[entity.entity_type] || entity.entity_type,
      updatedAt: new Date().toISOString(),
      useCount:  existing ? existing.useCount + 1 : 1,
    }
  })

  profile.lastUpdated = new Date().toISOString()
  await saveProfile(profile)
}

// ── Delete single field ───────────────────────────────────────────────────────

export async function deleteProfileField(key: string): Promise<void> {
  const profile = await getProfile()
  delete profile.fields[key]
  profile.lastUpdated = new Date().toISOString()
  await saveProfile(profile)
}

// ── Clear all ─────────────────────────────────────────────────────────────────

export async function clearProfile(): Promise<void> {
  return new Promise(resolve => {
    chrome.storage.local.remove(STORAGE_KEY, resolve)
  })
}