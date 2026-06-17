import React, { useState, useEffect } from 'react'
import FieldPanel from '../components/FieldPanel'
import ReviewPanel from '../components/ReviewPanel'
import useFormScanner from '../hooks/useFormScanner'
import useReview from '../hooks/useReview'
import { extractEntities, mapEntitiesToFields, Entity, MappingResult } from '../services/api'

type SupportedLanguage = 'en-IN' | 'hi-IN' | 'en-US'
type Status  = 'idle' | 'listening' | 'error'
type TabName = 'speech' | 'fields' | 'review'

const LANGUAGES = [
  { label: '🇮🇳 English (India)', value: 'en-IN' as SupportedLanguage },
  { label: '🇮🇳 Hindi',           value: 'hi-IN' as SupportedLanguage },
  { label: '🌐 English (US)',      value: 'en-US' as SupportedLanguage },
]

const Popup: React.FC = () => {
  const [activeTab, setActiveTab]       = useState<TabName>('speech')
  const [status, setStatus]             = useState<Status>('idle')
  const [language, setLanguage]         = useState<SupportedLanguage>('en-IN')
  const [transcript, setTranscript]     = useState('')
  const [interimText, setInterimText]   = useState('')
  const [error, setError]               = useState<string | null>(null)
  const [entities, setEntities]         = useState<Entity[]>([])
  const [isExtracting, setIsExtracting] = useState(false)
  const [isMapping, setIsMapping]       = useState(false)
  const [pipelineStep, setPipelineStep] = useState<string>('')

  const { fields, isScanning, lastScanned, scanFields, clearFields } = useFormScanner()
  const {
    items: reviewItems,
    isFilling,
    fillResult,
    loadMappings,
    updateItem,
    approveAll,
    fillApproved,
    clearReview,
  } = useReview()

  // ── Message listener ──
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
      }
    }
    chrome.runtime.onMessage.addListener(handler)
    return () => chrome.runtime.onMessage.removeListener(handler)
  }, [])

  // ── Send to content script ──
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
            setError('Page connection lost. Refresh the page.')
            return
          }
          callback?.(res)
        })
      }

      // Check if content script is alive
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

  // ── Full pipeline: extract → map → load review ──
  const handlePipeline = async () => {
    if (!transcript) return
    setError(null)
    clearReview()

    // Step 1: extract entities
    setPipelineStep('Extracting entities...')
    setIsExtracting(true)
    let extractedEntities: Entity[] = []
    try {
      const res = await extractEntities(transcript)
      extractedEntities = res.entities
      setEntities(extractedEntities)
    } catch {
      setError('Backend unreachable. Run: uvicorn main:app --reload --port 8000')
      setIsExtracting(false)
      setPipelineStep('')
      return
    }
    setIsExtracting(false)

    if (!extractedEntities.length) {
      setError('No entities found. Try speaking more clearly.')
      setPipelineStep('')
      return
    }

    // Step 2: scan fields if needed
    setPipelineStep('Scanning form fields...')
    let currentFields = fields
    if (!currentFields.length) {
      currentFields = await new Promise<any[]>(resolve => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tabId = tabs[0]?.id
          if (!tabId) { resolve([]); return }
          chrome.tabs.sendMessage(tabId, { type: 'SCAN_FIELDS' }, (res) => {
            resolve(res?.fields || [])
          })
        })
      })
    }

    if (!currentFields.length) {
      setError('No form fields found on this page.')
      setPipelineStep('')
      return
    }

    // Step 3: map
    setPipelineStep('Mapping to fields...')
    setIsMapping(true)
    let mappedResults: MappingResult[] = []
    try {
      const res = await mapEntitiesToFields(extractedEntities, currentFields)
      mappedResults = res.mappings
    } catch {
      setError('Mapping failed. Check backend.')
      setIsMapping(false)
      setPipelineStep('')
      return
    }
    setIsMapping(false)
    setPipelineStep('')

    // Step 4: load into review panel
    loadMappings(mappedResults)
    setActiveTab('review')   // auto-switch to review tab
  }

  // ── Speech handlers ──
  const handleStart = () => {
    setError(null)
    sendToPage('START_LISTENING', { lang: language })
  }

  const handleStop = () => sendToPage('STOP_LISTENING')

  const handleClear = () => {
    setTranscript(''); setInterimText('')
    setEntities([]); clearReview()
    setError(null); setStatus('idle'); setPipelineStep('')
  }

  const displayText = transcript + (interimText ? ' ' + interimText : '')
  const isProcessing = isExtracting || isMapping
  const reviewCount = reviewItems.length

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
        <button
          className={`tab-btn ${activeTab === 'review' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('review')}
        >
          📝 Review
          {reviewCount > 0 && (
            <span className="tab-badge">{reviewCount}</span>
          )}
        </button>
      </div>

      {/* ── Speech Tab ── */}
      {activeTab === 'speech' && (
        <>
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

          <div className={`status-badge status-${status}`}>
            {status === 'listening' ? '🔴 Listening...'
              : status === 'error' ? '❌ Error' : '⚪ Ready'}
          </div>

          <div className={`transcript-box ${status === 'listening' ? 'transcript-active' : ''}`}>
            {displayText ? (
              <>
                <span className="transcript-final">{transcript}</span>
                {interimText && (
                  <span className="transcript-interim"> {interimText}</span>
                )}
              </>
            ) : (
              <p className="transcript-placeholder">
                {status === 'listening'
                  ? 'Start speaking...'
                  : 'Click "Start" then speak naturally.'}
              </p>
            )}
          </div>

          {error && <div className="error-box">⚠️ {error}</div>}

          {/* Pipeline progress */}
          {pipelineStep && (
            <div className="pipeline-step">⏳ {pipelineStep}</div>
          )}

          {/* Listen controls */}
          <div className="button-row">
            <button
              className="btn btn-primary"
              onClick={handleStart}
              disabled={status === 'listening'}
            >🎙️ Start</button>
            <button
              className="btn btn-secondary"
              onClick={handleStop}
              disabled={status !== 'listening'}
            >⏹️ Stop</button>
            {transcript && (
              <button className="btn btn-ghost" onClick={handleClear}>🗑️</button>
            )}
          </div>

          {/* Main CTA — goes to review panel */}
          {transcript && status === 'idle' && (
            <button
              className="btn btn-autofill"
              onClick={handlePipeline}
              disabled={isProcessing}
            >
              {isProcessing
                ? `⏳ ${pipelineStep}`
                : '📝 Extract & Review Mappings'}
            </button>
          )}

          {/* Tip */}
          {!transcript && (
            <div className="tip-box">
              💡 Speak naturally — "My name is Somil Jain, email somil@gmail.com,
              phone 9876543210, income three lakh rupees"
            </div>
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

      {/* ── Review Tab ── */}
      {activeTab === 'review' && (
        <ReviewPanel
          items={reviewItems}
          onItemChange={updateItem}
          onApproveAll={approveAll}
          onFillApproved={fillApproved}
          isFilling={isFilling}
          fillResult={fillResult}
        />
      )}

      <p className="popup-footer">Phase 7 — User Review Panel</p>
    </div>
  )
}

export default Popup