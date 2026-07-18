import React, { useState, useEffect } from 'react'
import FieldPanel   from '../components/FieldPanel'
import ReviewPanel  from '../components/ReviewPanel'
import ProfileTab   from '../components/ProfileTab'
import useFormScanner from '../hooks/useFormScanner'
import useReview    from '../hooks/useReview'
import useProfile   from '../hooks/useProfile'
import IntelligencePanel from '../components/IntelligencePanel'
import { extractEntities, mapEntitiesToFields, analyzeForm, Entity, MappingResult, AnalyzeResponse } from '../services/api'
import OCRPanel from '../components/OCRPanel'
import { OCRField } from '../services/api'

type SupportedLanguage = 'en-IN' | 'hi-IN' | 'en-US'
type Status  = 'idle' | 'listening' | 'error'
type TabName = 'speech' | 'fields' | 'review' | 'profile' | 'intelligence' | 'ocr'

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
  const [pipelineStep, setPipelineStep] = useState('')
  // Add new state
  const [analysis, setAnalysis]         = useState<AnalyzeResponse | null>(null)
  const [isAnalyzing, setIsAnalyzing]   = useState(false)
  const [template, setTemplate]         = useState<'common' | 'scholarship'>('common')
  const [ocrFields, setOcrFields]       = useState<OCRField[]>([])
  const { fields, isScanning, lastScanned, scanFields, clearFields } = useFormScanner()

  const {
    items: reviewItems, isFilling, fillResult,
    loadMappings, updateItem, approveAll, fillApproved, clearReview,
  } = useReview()

  const {
    profile, isLoading: profileLoading, isSaving: profileSaving,
    updateField, deleteField, clearAll, saveEntities, getFieldValue,
  } = useProfile()

  // ── Message listener ──────────────────────────────────────────────────────
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


  // Add near your other useEffects
  useEffect(() => {
    // Proactively wake/inject content script when popup opens
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      const tabId = tab?.id
      const url = tab?.url || ''
      if (!tabId || !(url.startsWith('http://') || url.startsWith('https://'))) return

      chrome.tabs.sendMessage(tabId, { type: 'PING' }, (res) => {
        if (chrome.runtime.lastError) {
          chrome.scripting.executeScript({
            target: { tabId },
            files: ['contentScript.js'],
          })
        }
      })
    })
  }, [])
  
  // ── Send to content script ────────────────────────────────────────────────
  const sendToPage = (type: string, extra = {}, callback?: (r: any) => void) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      const tabId = tab?.id
      const url = tab?.url || ''

      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        setError('Please open a real webpage first.')
        return
      }

      const trySend = (isRetry = false) => {
        chrome.tabs.sendMessage(tabId!, { type, ...extra }, (res) => {
          if (chrome.runtime.lastError) {
            if (!isRetry) {
              // Content script likely not injected yet — inject and retry ONCE
              chrome.scripting.executeScript(
                { target: { tabId: tabId! }, files: ['contentScript.js'] },
                () => {
                  if (chrome.runtime.lastError) {
                    setError('Could not connect to page. Please refresh and try again.')
                    return
                  }
                  setTimeout(() => trySend(true), 250)
                }
              )
            } else {
              setError('Page connection lost. Please refresh the page and try again.')
            }
            return
          }
          callback?.(res)
        })
      }

      trySend()
    })
  }

  // ── Full pipeline ─────────────────────────────────────────────────────────
  const handlePipeline = async (sourceText?: string) => {
    const text = sourceText || transcript
    if (!text) return
    setError(null); clearReview()

    // Extract
    setPipelineStep('Extracting entities...')
    setIsExtracting(true)
    let extractedEntities: Entity[] = []
    try {
      // In handlePipeline, update the extract call:
      const res = await extractEntities(
        text,
        language === 'hi-IN' ? 'hi' : 'en'
      )
      extractedEntities = res.entities
      setEntities(extractedEntities)

      // Show detected language
      if (res.detected_language === 'hi') {
        console.log('Hindi detected — using Hindi NLP pipeline')
      }
    } catch {
      setError('Backend unreachable. Run: uvicorn main:app --reload --port 8000')
      setIsExtracting(false); setPipelineStep(''); return
    }
    setIsExtracting(false)

    if (!extractedEntities.length) {
      setError('No entities found in transcript.')
      setPipelineStep(''); return
    }

    // Scan fields if needed
    // In handlePipeline, replace the field scanning section with:

    setPipelineStep('Scanning form fields...')
    let currentFields: any[] = fields.length ? fields : ocrFields

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
      setPipelineStep(''); return
    }

    // Map
    setPipelineStep('Mapping to fields...')
    setIsMapping(true)
    let mappedResults: MappingResult[] = []
    try {
      const res = await mapEntitiesToFields(extractedEntities, currentFields)
      mappedResults = res.mappings
    } catch {
      setError('Mapping failed. Check backend.')
      setIsMapping(false); setPipelineStep(''); return
    }
    setIsMapping(false); setPipelineStep('')

    loadMappings(mappedResults)

    // After loadMappings(mappedResults) and before setActiveTab, add:

    setPipelineStep('Analyzing form...')
    setIsAnalyzing(true)
    try {
      const analyzeResult = await analyzeForm(extractedEntities, currentFields, template)
      setAnalysis(analyzeResult)
    } catch {
      // Analysis is non-critical, fail silently
      setAnalysis(null)
    } finally {
      setIsAnalyzing(false)
    }
    setPipelineStep('')

    loadMappings(mappedResults)
    setActiveTab('review')

    setActiveTab('review')
  }

  // ── Fill from profile ─────────────────────────────────────────────────────
  // Build a fake transcript from saved profile data, run through pipeline
  const handleFillFromProfile = async () => {
    const profileFields = profile?.fields
    if (!profileFields || Object.keys(profileFields).length === 0) return

    setError(null); clearReview()

    // Scan fields first
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
      setPipelineStep(''); return
    }

    // Build entity list directly from profile
    const profileEntities: Entity[] = Object.values(profileFields).map(f => ({
      entity_type: f.key,
      value:       f.value,
      normalized:  f.value,
      confidence:  1.0,
      raw_text:    f.value,
    }))

    // Map directly
    setPipelineStep('Mapping profile to fields...')
    setIsMapping(true)
    let mappedResults: MappingResult[] = []
    try {
      const res = await mapEntitiesToFields(profileEntities, currentFields)
      mappedResults = res.mappings
    } catch {
      setError('Mapping failed. Check backend.')
      setIsMapping(false); setPipelineStep(''); return
    }
    setIsMapping(false); setPipelineStep('')

    loadMappings(mappedResults)
    setActiveTab('review')
  }

  // ── Auto-save to profile after fill ──────────────────────────────────────
  useEffect(() => {
    if (fillResult && fillResult.success > 0 && entities.length > 0) {
      saveEntities(entities)
    }
  }, [fillResult])

  // ── Speech handlers ───────────────────────────────────────────────────────
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
  const reviewCount  = reviewItems.length
  const profileCount = profile ? Object.keys(profile.fields).length : 0

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
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
          <span>Voice</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'fields' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('fields')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>`
            <path d="M3 9h18"/>
            <path d="M9 21V9"/>
          </svg>
          <span>Fields {fields.length > 0 && `(${fields.length})`}</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'review' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('review')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4"/>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          <span>
            Review
            {reviewCount > 0 && <span className="tab-badge">{reviewCount}</span>}
          </span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'profile' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span>
            Profile
            {profileCount > 0 && <span className="tab-badge tab-badge-green">{profileCount}</span>}
          </span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'intelligence' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('intelligence')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4l3 3"/>
          </svg>
          <span>
            Insights
            {analysis && analysis.completion.percentage < 100 && (
              <span className="tab-badge tab-badge-amber">!</span>
            )}
          </span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'ocr' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('ocr')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          <span>Scan {ocrFields.length > 0 && `(${ocrFields.length})`}</span>
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

          <div className="lang-row">
            <label className="lang-label">Form type:</label>
            <select
              className="lang-select"
              value={template}
              onChange={e => setTemplate(e.target.value as 'common' | 'scholarship')}
            >
              <option value="common">General form</option>
              <option value="scholarship">Scholarship/admission</option>
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
          {pipelineStep && <div className="pipeline-step">⏳ {pipelineStep}</div>}

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

          {transcript && status === 'idle' && (
            <button
              className="btn btn-autofill"
              onClick={() => handlePipeline()}
              disabled={isProcessing}
            >
              {isProcessing ? `⏳ ${pipelineStep}` : '📝 Extract & Review Mappings'}
            </button>
          )}

          {/* Profile quick-fill suggestion */}
          {profileCount > 0 && !transcript && (
            <div className="profile-suggestion">
              <div className="suggestion-text">
                💾 You have {profileCount} saved profile fields
              </div>
              <button
                className="btn-use-profile"
                onClick={() => {
                  setActiveTab('profile')
                }}
              >
                View Profile →
              </button>
            </div>
          )}

          {!transcript && profileCount === 0 && (
            <div className="tip-box">
              💡 Try: "My name is Somil Jain, email somil@gmail.com,
              phone 9876543210, income three lakh rupees"
            </div>
          )}

          {/* Hindi test helper */}
          {language === 'hi-IN' && !transcript && (
            <div className="hindi-helper">
              <p className="hindi-helper-title">🇮🇳 Hindi examples:</p>
              {[
                'मेरा नाम सोमिल जैन है',
                'मेरी वार्षिक आय तीन लाख रुपये है',
                'मेरा फोन नंबर 9876543210 है',
              ].map(example => (
                <button
                  key={example}
                  className="hindi-example-btn"
                  onClick={() => setTranscript(example)}
                >
                  {example}
                </button>
              ))}
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

      {/* ── Profile Tab ── */}
      {activeTab === 'profile' && (
        <ProfileTab
          profile={profile}
          isLoading={profileLoading}
          isSaving={profileSaving}
          onUpdate={updateField}
          onDelete={deleteField}
          onClearAll={clearAll}
          onFillFromProfile={handleFillFromProfile}
        />
      )}

      {/* ── intellegence Tab ── */}
      <button
        className={`tab-btn ${activeTab === 'intelligence' ? 'tab-active' : ''}`}
        onClick={() => setActiveTab('intelligence')}
      >
        🧠
        {analysis && analysis.completion.percentage < 100 && (
          <span className="tab-badge tab-badge-amber">!</span>
        )}
      </button>

      {activeTab === 'intelligence' && (
        <IntelligencePanel analysis={analysis} isAnalyzing={isAnalyzing} />
      )}

      <button
        className={`tab-btn ${activeTab === 'ocr' ? 'tab-active' : ''}`}
        onClick={() => setActiveTab('ocr')}
      >
        📄 {ocrFields.length > 0 && `(${ocrFields.length})`}
      </button>

      {activeTab === 'ocr' && (
        <OCRPanel onFieldsExtracted={setOcrFields} />
      )}

      <p className="popup-footer">Phase 8 — Profile Memory</p>
    </div>
  )
}

export default Popup