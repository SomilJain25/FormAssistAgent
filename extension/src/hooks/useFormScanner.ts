import { useState, useCallback } from 'react'
import type { DetectedField } from '../content/contentScript'
import { sendToActiveTab } from '../services/tabMessaging'

interface FormScannerState {
  fields: DetectedField[]
  isScanning: boolean
  error: string | null
  lastScanned: Date | null
}

interface FormScannerControls {
  scanFields: () => void
  clearFields: () => void
}

const useFormScanner = (): FormScannerState & FormScannerControls => {
  const [fields, setFields]           = useState<DetectedField[]>([])
  const [isScanning, setIsScanning]   = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [lastScanned, setLastScanned] = useState<Date | null>(null)

  const scanFields = useCallback(() => {
    setIsScanning(true)
    setError(null)
    sendToActiveTab<{ fields?: DetectedField[] }>('SCAN_FIELDS')
      .then(res => {
        const found = res?.fields || []
        setFields(found)
        setLastScanned(new Date())
        if (!found.length) setError('No form fields found on this page.')
      })
      .catch(e => setError(e?.message || 'Could not scan page.'))
      .finally(() => setIsScanning(false))
  }, [])

  const clearFields = useCallback(() => {
    setFields([])
    setError(null)
    setLastScanned(null)
  }, [])

  return { fields, isScanning, error, lastScanned, scanFields, clearFields }
}

export default useFormScanner
