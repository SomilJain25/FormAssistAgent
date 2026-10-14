import React, { useState, useEffect } from 'react'
import FieldPanel   from '../components/FieldPanel'
import ReviewPanel  from '../components/ReviewPanel'
import ProfileTab   from '../components/ProfileTab'
import IntelligencePanel from '../components/IntelligencePanel'
import OCRPanel from '../components/OCRPanel'
import useFormScanner from '../hooks/useFormScanner'
import useReview    from '../hooks/useReview'
import useProfile   from '../hooks/useProfile'
import {
  extractEntities, mapEntitiesToFields, analyzeForm, wakeBackend,
} from '../services/api'
import type { Entity, MappingResult, AnalyzeResponse, OCRField } from '../services/api'
import { sendToActiveTab } from '../services/tabMessaging'
import {
  EMPTY_SPEECH, SPEECH_KEY, readSpeech, patchSpeech,
} from '../services/speechStore'
import type { SpeechState } from '../services/speechStore'

type SupportedLanguage = 'en-IN' | 'hi-IN' | 'en-US'
type TabName = 'speech' | 'fields' | 'review' | 'profile' | 'intelligence' | 'ocr'

const LANGUAGES = [
  { label: '🇮🇳 English (India)', value: 'en-IN' as SupportedLanguage },
  { label: '🇮🇳 Hindi',           value: 'hi-IN' as SupportedLanguage },
  { label: '🌐 English (US)',      value: 'en-US' as SupportedLanguage },
]

const BACKEND_HELP =
  'Could not reach the server. It may be waking up (free hosting sleeps when idle) — wait ~30 seconds and try again.'

const Popup: React.FC = () => {
  const [activeTab, setActiveTab]       = useState<TabName>('speech')
  const [language, setLanguage]         = useState<SupportedLanguage>('en-IN')
  const [speech, setSpeech]             = useState<SpeechState>(EMPTY_SPEECH)
  const [error, setError]               = useState<string | null>(null)
  const [entities, setEntities]         = useState<Entity[]>([])
  const [isExtracting, setIsExtracting] = useState(false)
  const [isMapping, setIsMapping]       = useState(false)
  const [pipelineStep, setPipelineStep] = useState('')
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
    updateField, deleteField, clearAll, saveEntities,
  } = useProfile()

  const status     = speech.status
  const transcript = speech.transcript
  const interimText = speech.interim

  // ── Speech state lives in chrome.storage (survives the popup closing) ─────
  useEffect(() => {
    readSpeech().then(async (state) => {
      setSpeech(state)
      if (state.status !== 'listening') return
      // Stored "listening" may be stale (browser restarted / tab navigated) → verify
      try {
        const res = await sendToActiveTab<{ listening?: boolean }>('PING')
        if (!res?.listening) patchSpeech({ status: 'idle', interim: '' })
      } catch {
        patchSpeech({ status: 'idle', interim: '' })
      }
    })

    const onChange = (changes: { [k: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === 'local' && changes[SPEECH_KEY]) {
        setSpeech({ ...EMPTY_SPEECH, ...(changes[SPEECH_KEY].newValue || {}) })
      }
    }
    chrome.storage.onChanged.addListener(onChange)
    wakeBackend() // start booting the (possibly sleeping) server right away
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [])

  useEffect(() => { if (speech.error) setError(speech.error) }, [speech.error])

  // Fresh scan of the live page (field list may have changed since the last scan)
  const scanLivePage = async (): Promise<any[]> => {
    try {
      const res = await sendToActiveTab<{ fields: any[] }>('SCAN_FIELDS')
      return res?.fields || []
    } catch (e: any) {
      setError(e?.message || 'Could not scan the page.')
      return []
    }
  }

  // ── Full pipeline: extract → scan → map → analyse ─────────────────────────
  const handlePipeline = async (sourceText?: string) => {
    const text = (sourceText || transcript).trim()
    if (!text) return
    setError(null); clearReview()

    setPipelineStep('Extracting entities...')
    setIsExtracting(true)
    let extractedEntities: Entity[] = []
    try {
      const res = await extractEntities(text, language === 'hi-IN' ? 'hi' : 'auto')
      extractedEntities = res.entities
      setEntities(extractedEntities)
    } catch {
      setError(BACKEND_HELP)
      setIsExtracting(false); setPipelineStep(''); return
    }
    setIsExtracting(false)

    if (!extractedEntities.length) {
      setError('No details found in what you said. Try e.g. "My name is ..., email ..., phone ...".')
      setPipelineStep(''); return
    }

    setPipelineStep('Scanning form fields...')
    let currentFields: any[] = await scanLivePage()
    if (!currentFields.length && ocrFields.length) currentFields = ocrFields
    if (!currentFields.length) {
      setError(prev => prev || 'No form fields found on this page.')
      setPipelineStep(''); return
    }

    setPipelineStep('Mapping to fields...')
    setIsMapping(true)
    let mappedResults: MappingResult[] = []
    try {
      const res = await mapEntitiesToFields(extractedEntities, currentFields)
      mappedResults = res.mappings
    } catch {
      setError(BACKEND_HELP)
      setIsMapping(false); setPipelineStep(''); return
    }
    setIsMapping(false)
    loadMappings(mappedResults)

    setPipelineStep('Analyzing form...')
    setIsAnalyzing(true)
    try {
      setAnalysis(await analyzeForm(extractedEntities, currentFields, template))
    } catch {
      setAnalysis(null) // non-critical
    } finally {
      setIsAnalyzing(false)
    }
    setPipelineStep('')
    setActiveTab('review')
  }

  // ── Fill from saved profile ───────────────────────────────────────────────
  const handleFillFromProfile = async () => {
    const profileFields = profile?.fields
    if (!profileFields || Object.keys(profileFields).length === 0) return

    setError(null); clearReview()
    setPipelineStep('Scanning form fields...')
    const currentFields = await scanLivePage()
    if (!currentFields.length) {
      setError(prev => prev || 'No form fields found on this page.')
      setPipelineStep(''); return
    }

    const profileEntities: Entity[] = Object.values(profileFields).map(f => ({
      entity_type: f.key, value: f.value, normalized: f.value, confidence: 1.0, raw_text: f.value,
    }))

    setPipelineStep('Mapping profile to fields...')
    setIsMapping(true)
    try {
      const res = await mapEntitiesToFields(profileEntities, currentFields)
      loadMappings(res.mappings)
      setEntities(profileEntities)
      setActiveTab('review')
    } catch {
      setError(BACKEND_HELP)
    } finally {
      setIsMapping(false); setPipelineStep('')
    }
  }

  // ── Auto-save to profile after a successful fill ──────────────────────────
  useEffect(() => {
    if (fillResult && fillResult.success > 0 && entities.length > 0) {
      saveEntities(entities)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillResult])

  // ── Speech handlers ───────────────────────────────────────────────────────
  const handleStart = async () => {
    setError(null)
    await patchSpeech({ error: null })
    try {
      await sendToActiveTab('START_LISTENING', { lang: language })
    } catch (e: any) {
      setError(e?.message || 'Could not start listening.')
    }
  }

  const handleStop = async () => {
    try { await sendToActiveTab('STOP_LISTENING') } catch { /* ignore */ }
    await patchSpeech({ status: 'idle', interim: '' })
  }

  const handleClear = async () => {
    try { if (status === 'listening') await sendToActiveTab('STOP_LISTENING') } catch { /* ignore */ }
    await patchSpeech({ ...EMPTY_SPEECH })
    setEntities([]); clearReview()
    setError(null); setPipelineStep('')
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
            <rect x="3" y="3" width="18" height="18" rx="2"/>
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
              Start
            </button>
            <button className="btn btn-secondary" onClick={handleStop} disabled={status !== 'listening'}>
              Stop
            </button>
            {transcript && (
              <button className="btn btn-ghost" onClick={handleClear}>Clear</button>
            )}
          </div>

          {transcript && status !== 'listening' && (
            <button
              className="btn btn-autofill"
              onClick={() => handlePipeline()}
              disabled={isProcessing}
            >
              {isProcessing ? pipelineStep : 'Extract & Review Mappings'}
            </button>
          )}

          {/* Profile quick-fill suggestion */}
          {profileCount > 0 && !transcript && (
            <div className="profile-suggestion">
              <div className="suggestion-text">
                You have {profileCount} saved profile fields
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
              Try: "My name is Somil Jain, email somil@gmail.com,
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
                  onClick={() => patchSpeech({ transcript: example })}
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

      {/* ── Insights Tab ── */}
      {activeTab === 'intelligence' && (
        <IntelligencePanel analysis={analysis} isAnalyzing={isAnalyzing} />
      )}

      {/* ── OCR Tab ── */}
      {activeTab === 'ocr' && (
        <OCRPanel onFieldsExtracted={setOcrFields} />
      )}
    </div>
  )
}

export default Popup
