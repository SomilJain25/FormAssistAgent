import React, { useState, useEffect } from 'react'
import FieldPanel from '../components/FieldPanel'
import useFormScanner from '../hooks/useFormScanner'
import { extractEntities, mapEntitiesToFields, Entity, MappingResult } from '../services/api'

type SupportedLanguage = 'en-IN' | 'hi-IN' | 'en-US'
type Status  = 'idle' | 'listening' | 'error'
type TabName = 'speech' | 'fields'

const LANGUAGES = [
  { label: '🇮🇳 English (India)', value: 'en-IN' as SupportedLanguage },
  { label: '🇮🇳 Hindi',           value: 'hi-IN' as SupportedLanguage },
  { label: '🌐 English (US)',      value: 'en-US' as SupportedLanguage },
]

const Popup: React.FC = () => {
  const [activeTab, setActiveTab]         = useState<TabName>('speech')
  const [status, setStatus]               = useState<Status>('idle')
  const [language, setLanguage]           = useState<SupportedLanguage>('en-IN')
  const [transcript, setTranscript]       = useState('')
  const [interimText, setInterimText]     = useState('')
  const [error, setError]                 = useState<string | null>(null)
  const [entities, setEntities]           = useState<Entity[]>([])
  const [mappings, setMappings]           = useState<MappingResult[]>([])
  const [fillResults, setFillResults]     = useState<{success: number; failed: number} | null>(null)
  const [isExtracting, setIsExtracting]   = useState(false)
  const [isMapping, setIsMapping]         = useState(false)
  const [isFilling, setIsFilling]         = useState(false)

  const { fields, isScanning, lastScanned, scanFields, clearFields } = useFormScanner()

  // ── Message listener from content script ──
  useEffect(() => {
    const handler = (message: any) => {
      switch (message.type) {
        case 'SPEECH_STARTED': setStatus('listening'); setError(null); break
        case 'SPEECH_RESULT':
          if (message.finalText)
            setTranscript(prev => (prev + ' ' + message.finalText).trim())
          setInterimText(message.interimText || '')
          break
        case 'SPEECH_STOPPED': setStatus('idle'); setInterimText(''); break
        case 'SPEECH_ERROR':   setStatus('error'); setError(message.error); break
        case 'FILL_COMPLETE':
          const results = message.results || []
          setFillResults({
            success: results.filter((r: any) => r.success).length,
            failed:  results.filter((r: any) => !r.success).length,
          })
          setIsFilling(false)
          break
      }
    }
    chrome.runtime.onMessage.addListener(handler)
    return () => chrome.runtime.onMessage.removeListener(handler)
  }, [])

  // ── Send message to content script ──
  const sendToPage = (type: string, extra = {}, callback?: (r: any) => void) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      const tabId = tab?.id
      const url = tab?.url || ''

      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        setError('Please open a real webpage first.')
        return
      }

      const send = () => {
        chrome.tabs.sendMessage(tabId!, { type, ...extra }, (res) => {
          if (chrome.runtime.lastError) {
            setError('Page connection lost. Please refresh the page.')
            return
          }
          callback?.(res)
        })
      }

      chrome.tabs.sendMessage(tabId!, { type: 'PING' }, (res) => {
        if (chrome.runtime.lastError) {
          chrome.scripting.executeScript(
            { target: { tabId: tabId! }, files: ['contentScript.js'] },
            () => setTimeout(send, 300)
          )
        } else {
          send()
        }
      })
    })
  }

  // ── Handlers ──
  const handleStart = () => {
    setError(null)
    setFillResults(null)
    sendToPage('START_LISTENING', { lang: language })
  }

  const handleStop = () => sendToPage('STOP_LISTENING')

  const handleClear = () => {
    setTranscript(''); setInterimText('')
    setEntities([]); setMappings([])
    setFillResults(null); setError(null); setStatus('idle')
  }

  const handleExtract = async () => {
    setIsExtracting(true)
    setMappings([]); setFillResults(null)
    try {
      const result = await extractEntities(transcript)
      setEntities(result.entities)
    } catch {
      setError('Backend unreachable. Run: uvicorn main:app --reload --port 8000')
    } finally {
      setIsExtracting(false)
    }
  }

  const handleMap = async () => {
    setIsMapping(true)
    setFillResults(null)
    try {
      const result = await mapEntitiesToFields(entities, fields)
      setMappings(result.mappings)
    } catch {
      setError('Mapping failed. Check backend.')
    } finally {
      setIsMapping(false)
    }
  }

  const handleFill = () => {
    const matched = mappings.filter(m => m.matched)
    if (!matched.length) return

    setIsFilling(true)
    setFillResults(null)

    const instructions = matched.map(m => ({
      fieldId: m.field_id,
      value: m.entity_value,
    }))

    sendToPage('FILL_FIELDS', { instructions }, (res) => {
      if (res?.results) {
        setFillResults({
          success: res.results.filter((r: any) => r.success).length,
          failed:  res.results.filter((r: any) => !r.success).length,
        })
      }
      setIsFilling(false)
    })
  }

  // ── One-click full pipeline ──
  const handleAutoFill = async () => {
    if (!transcript) return
    setError(null); setFillResults(null)

    // Step 1: extract
    setIsExtracting(true)
    let extractedEntities: Entity[] = []
    try {
      const extractResult = await extractEntities(transcript)
      extractedEntities = extractResult.entities
      setEntities(extractedEntities)
    } catch {
      setError('Backend unreachable. Run: uvicorn main:app --reload --port 8000')
      setIsExtracting(false)
      return
    }
    setIsExtracting(false)

    // Step 2: scan fields if not already done
    let currentFields = fields
    if (!currentFields.length) {
      await new Promise<void>(resolve => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tabId = tabs[0]?.id
          if (!tabId) { resolve(); return }
          chrome.tabs.sendMessage(tabId, { type: 'SCAN_FIELDS' }, (res) => {
            if (res?.fields) currentFields = res.fields
            resolve()
          })
        })
      })
    }

    if (!currentFields.length) {
      setError('No form fields found on this page.')
      return
    }

    // Step 3: map
    setIsMapping(true)
    let mappedResults: MappingResult[] = []
    try {
      const mapResult = await mapEntitiesToFields(extractedEntities, currentFields)
      mappedResults = mapResult.mappings
      setMappings(mappedResults)
    } catch {
      setError('Mapping failed.')
      setIsMapping(false)
      return
    }
    setIsMapping(false)

    // Step 4: fill
    const matched = mappedResults.filter(m => m.matched)
    if (!matched.length) {
      setError('No fields matched. Try scanning the page first.')
      return
    }

    setIsFilling(true)
    const instructions = matched.map(m => ({
      fieldId: m.field_id,
      value: m.entity_value,
    }))

    sendToPage('FILL_FIELDS', { instructions }, (res) => {
      if (res?.results) {
        setFillResults({
          success: res.results.filter((r: any) => r.success).length,
          failed:  res.results.filter((r: any) => !r.success).length,
        })
      }
      setIsFilling(false)
    })
  }

  const displayText = transcript + (interimText ? ' ' + interimText : '')
  const matchedCount = mappings.filter(m => m.matched).length
  const isProcessing = isExtracting || isMapping || isFilling

  return (
    <div className="popup-container">
      {/* Header */}
      <div className="popup-header">
        <div className={`logo ${status === 'listening' ? 'logo-pulse' : ''}`}>🎤</div>
        <div>
          <h1 className="popup-title">Voice Form Assistant</h1>
          <p className="popup-subtitle">Speak to fill any form</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        <button
          className={`tab-btn ${activeTab === 'speech' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('speech')}
        >🎙️ Speech</button>
        <button
          className={`tab-btn ${activeTab === 'fields' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('fields')}
        >📋 Fields {fields.length > 0 && `(${fields.length})`}</button>
      </div>

      {/* ── Speech Tab ── */}
      {activeTab === 'speech' && (
        <>
          {/* Language */}
          <div className="lang-row">
            <label className="lang-label">Language:</label>
            <select
              className="lang-select"
              value={language}
              onChange={e => setLanguage(e.target.value as SupportedLanguage)}
              disabled={status === 'listening'}
            >
              {LANGUAGES.map(l => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className={`status-badge status-${status}`}>
            {status === 'listening' ? '🔴 Listening...'
              : status === 'error' ? '❌ Error' : '⚪ Ready'}
          </div>

          {/* Transcript */}
          <div className={`transcript-box ${status === 'listening' ? 'transcript-active' : ''}`}>
            {displayText ? (
              <>
                <span className="transcript-final">{transcript}</span>
                {interimText && <span className="transcript-interim"> {interimText}</span>}
              </>
            ) : (
              <p className="transcript-placeholder">
                {status === 'listening' ? 'Start speaking...' : 'Click "Start Listening" then speak.'}
              </p>
            )}
          </div>

          {/* Error */}
          {error && <div className="error-box">⚠️ {error}</div>}

          {/* Listen buttons */}
          <div className="button-row">
            <button className="btn btn-primary" onClick={handleStart} disabled={status === 'listening'}>
              🎙️ Start
            </button>
            <button className="btn btn-secondary" onClick={handleStop} disabled={status !== 'listening'}>
              ⏹️ Stop
            </button>
            {transcript && (
              <button className="btn btn-ghost" onClick={handleClear}>🗑️</button>
            )}
          </div>

          {/* ── AUTO FILL button — one click does everything ── */}
          {transcript && status === 'idle' && (
            <button
              className="btn btn-autofill"
              onClick={handleAutoFill}
              disabled={isProcessing}
            >
              {isExtracting ? '🧠 Extracting...'
                : isMapping  ? '🔗 Mapping...'
                : isFilling  ? '✍️ Filling...'
                : '⚡ Auto Fill Form'}
            </button>
          )}

          {/* Fill result banner */}
          {fillResults && (
            <div className={`fill-result ${fillResults.failed === 0 ? 'fill-success' : 'fill-partial'}`}>
              {fillResults.failed === 0
                ? `✅ ${fillResults.success} field${fillResults.success !== 1 ? 's' : ''} filled successfully!`
                : `⚠️ ${fillResults.success} filled, ${fillResults.failed} failed`
              }
            </div>
          )}

          {/* Step-by-step buttons (manual mode) */}
          {transcript && status === 'idle' && (
            <details className="manual-steps">
              <summary className="manual-summary">Step by step mode</summary>
              <div className="manual-body">
                <button className="btn btn-extract" onClick={handleExtract} disabled={isExtracting}>
                  {isExtracting ? '⏳...' : '🧠 1. Extract Entities'}
                </button>

                {entities.length > 0 && (
                  <div className="entity-list">
                    {entities.map(e => (
                      <div key={e.entity_type} className="entity-row">
                        <span className="entity-type">{e.entity_type}</span>
                        <span className="entity-value">{e.normalized}</span>
                        <span className="entity-conf">{Math.round(e.confidence * 100)}%</span>
                      </div>
                    ))}
                  </div>
                )}

                {entities.length > 0 && (
                  <button className="btn btn-map" onClick={handleMap} disabled={isMapping}>
                    {isMapping ? '⏳...' : `🔗 2. Map to Fields (${fields.length})`}
                  </button>
                )}

                {fields.length === 0 && entities.length > 0 && (
                  <div className="hint-box">💡 Scan fields first in the Fields tab.</div>
                )}

                {mappings.length > 0 && (
                  <div className="mapping-list">
                    {mappings.map(m => (
                      <div key={m.entity_type} className={`mapping-row ${m.matched ? 'mapping-matched' : 'mapping-unmatched'}`}>
                        <div className="mapping-left">
                          <span className="entity-type">{m.entity_type}</span>
                          <span className="mapping-arrow">→</span>
                          <span className="mapping-field">{m.field_label || '(no match)'}</span>
                        </div>
                        <span className="mapping-conf">
                          {m.matched ? `${Math.round(m.confidence * 100)}%` : '✗'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {matchedCount > 0 && (
                  <button className="btn btn-fill" onClick={handleFill} disabled={isFilling}>
                    {isFilling ? '✍️ Filling...' : `✍️ 3. Fill ${matchedCount} Fields`}
                  </button>
                )}
              </div>
            </details>
          )}
        </>
      )}

      {/* ── Fields Tab ── */}
      {activeTab === 'fields' && (
        <FieldPanel
          fields={fields}
          isScanning={isScanning}
          lastScanned={lastScanned}
          onScan={scanFields}
          onClear={clearFields}
        />
      )}

      <p className="popup-footer">Phase 6 — Auto Form Filling</p>
    </div>
  )
}

export default Popup