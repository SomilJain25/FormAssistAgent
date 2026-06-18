import { useState, useEffect, useCallback } from 'react'
import {
  UserProfile,
  ProfileField,
  getProfile,
  upsertProfileField,
  deleteProfileField,
  clearProfile,
  saveEntitiesToProfile,
} from '../services/profileStorage'
import { Entity } from '../services/api'

interface ProfileState {
  profile: UserProfile | null
  isLoading: boolean
  isSaving: boolean
}

interface ProfileControls {
  refreshProfile: () => Promise<void>
  updateField: (key: string, value: string) => Promise<void>
  deleteField: (key: string) => Promise<void>
  clearAll: () => Promise<void>
  saveEntities: (entities: Entity[]) => Promise<void>
  getFieldValue: (key: string) => string
}

const useProfile = (): ProfileState & ProfileControls => {
  const [profile, setProfile]   = useState<UserProfile | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [isSaving, setSaving]   = useState(false)

  const refreshProfile = useCallback(async () => {
    setLoading(true)
    const p = await getProfile()
    setProfile(p)
    setLoading(false)
  }, [])

  // Load on mount
  useEffect(() => { refreshProfile() }, [refreshProfile])

  const updateField = useCallback(async (key: string, value: string) => {
    setSaving(true)
    await upsertProfileField(key, value)
    await refreshProfile()
    setSaving(false)
  }, [refreshProfile])

  const deleteField = useCallback(async (key: string) => {
    await deleteProfileField(key)
    await refreshProfile()
  }, [refreshProfile])

  const clearAll = useCallback(async () => {
    await clearProfile()
    await refreshProfile()
  }, [refreshProfile])

  const saveEntities = useCallback(async (entities: Entity[]) => {
    if (!entities.length) return
    setSaving(true)
    await saveEntitiesToProfile(entities)
    await refreshProfile()
    setSaving(false)
  }, [refreshProfile])

  const getFieldValue = useCallback((key: string): string => {
    return profile?.fields[key]?.value || ''
  }, [profile])

  return {
    profile,
    isLoading,
    isSaving,
    refreshProfile,
    updateField,
    deleteField,
    clearAll,
    saveEntities,
    getFieldValue,
  }
}

export default useProfile