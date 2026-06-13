import { useState, useCallback } from 'react'
import { DetectedField } from '../content/contentScript'

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

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      const tabId = tab?.id
      const url = tab?.url || ''

      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        setError('Open a real webpage (http/https) to scan for form fields.')
        setIsScanning(false)
        return
      }

      // Send SCAN_FIELDS and get response directly
      chrome.tabs.sendMessage(tabId!, { type: 'SCAN_FIELDS' }, (response) => {
        setIsScanning(false)

        if (chrome.runtime.lastError) {
          // Content script not injected yet — inject first then retry
          chrome.scripting.executeScript(
            { target: { tabId: tabId! }, files: ['contentScript.js'] },
            () => {
              setTimeout(() => {
                chrome.tabs.sendMessage(tabId!, { type: 'SCAN_FIELDS' }, (res) => {
                  if (chrome.runtime.lastError || !res) {
                    setError('Could not scan page. Please refresh and try again.')
                    return
                  }
                  setFields(res.fields || [])
                  setLastScanned(new Date())
                })
              }, 300)
            }
          )
          return
        }

        if (response?.fields) {
          setFields(response.fields)
          setLastScanned(new Date())
        } else {
          setError('No form fields found on this page.')
        }
      })
    })
  }, [])

  const clearFields = useCallback(() => {
    setFields([])
    setError(null)
    setLastScanned(null)
  }, [])

  return { fields, isScanning, error, lastScanned, scanFields, clearFields }
}

export default useFormScanner