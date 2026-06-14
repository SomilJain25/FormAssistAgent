import React, { useState, useEffect } from 'react'
import FieldPanel from '../components/FieldPanel'
import useFormScanner from '../hooks/useFormScanner'
import { extractEntities, Entity } from '../services/api'

type SupportedLanguage = 'en-IN' | 'hi-IN' | 'en-US'
type Status = 'idle' | 'listening' | 'error'
type Tab = 'speech' | 'fields'

const LANGUAGES: { label: string; value: SupportedLanguage }[] = [
  { label: '🇮🇳 English (India)', value: 'en-IN' },
  { label: '🇮🇳 Hindi',           value: 'hi-IN' },
  { label: '🌐 English (US)',      value: 'en-US' },
]

const Popup: React.FC = () => {
  const [activeTab, setActiveTab]         = useState<Tab>('speech')
  const [status, setStatus]               = useState<Status>('idle')
  const [language, setLanguage]           = useState<SupportedLanguage>('en-IN')
  const [transcript, setTranscript]       = useState('')
  const [interimText, setInterimText]     = useState('')
  const [error, setError]                 = useState<string | null>(null)
  const [entities, setEntities]           = useState<Entity[]>([])
  const [isExtracting, setIsExtracting]   = useState(false)
  const { fields, isScanning, lastScanned, scanFields, clearFields } = useFormScanner()
  
  useEffect(() => {
    const handler = (message: any) => {
      switch (message.type) {
        case 'SPEECH_STARTED':
          setStatus('listening'); setError(null); break
        case 'SPEECH_RESULT':
          if (message.finalText)
            setTranscript(prev => (prev + ' ' + message.finalText).trim())
          setInterimText(message.interimText || '')
          break
        case 'SPEECH_STOPPED':
          setStatus('idle'); setInterimText(''); break
        case 'SPEECH_ERROR':
          setStatus('error'); setError(message.error); setInterimText(''); break
      }
    }
    chrome.runtime.onMessage.addListener(handler)
    return () => chrome.runtime.onMessage.removeListener(handler)
  }, [])

  const sendToContentScript = (type: string, extra = {}) => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0]
      const tabId = tab?.id
      const url = tab?.url || ''

      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        setError('Please open a regular webpage first.')
        return
      }

      chrome.tabs.sendMessage(tabId!, { type, ...extra }, () => {
        if (chrome.runtime.lastError) {
          chrome.scripting.executeScript(
            { target: { tabId: tabId! }, files: ['contentScript.js'] },
            () => {
              setTimeout(() => {
                chrome.tabs.sendMessage(tabId!, { type, ...extra })
              }, 300)
            }
          )
        }
      })
    })
  }

  const handleStart = () => {
    setError(null)
    sendToContentScript('START_LISTENING', { lang: language })
  }

  const handleStop  = () => sendToContentScript('STOP_LISTENING')

  const handleClear = () => {
    setTranscript('')
    setInterimText('')
    setEntities([])
    setError(null)
    setStatus('idle')
  }

  const displayText = transcript + (interimText ? ' ' + interimText : '')

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
          🎙️ Speech
        </button>
        <button
          className={`tab-btn ${activeTab === 'fields' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('fields')}
        >
          📋 Fields {fields.length > 0 && `(${fields.length})`}
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
              : status === 'error'  ? '❌ Error'
              : '⚪ Ready'}
          </div>

          <div className={`transcript-box ${status === 'listening' ? 'transcript-active' : ''}`}>
            {displayText ? (
              <>
                <span className="transcript-final">{transcript}</span>
                {interimText && <span className="transcript-interim"> {interimText}</span>}
              </>
            ) : (
              <p className="transcript-placeholder">
                {status === 'listening'
                  ? 'Start speaking...'
                  : 'Click "Start Listening" then speak naturally.'}
              </p>
            )}
          </div>
          
          {transcript && status === 'idle' && (
            <button
              className="btn btn-extract"
              disabled={isExtracting}
              onClick={async () => {
                setIsExtracting(true)

                try {
                  const result = await extractEntities(transcript)
                  setEntities(result.entities)
                } catch (e) {
                  setError('Could not reach backend. Is it running on port 8000?')
                } finally {
                  setIsExtracting(false)
                }
              }}
            >
              {isExtracting ? '⏳ Extracting...' : '🧠 Extract Entities'}
            </button>
          )}

          {entities.length > 0 && (
            <div className="entity-list">
              <h4>Detected Entities</h4>

              {entities.map((e, index) => (
                <div key={`${e.entity_type}-${index}`} className="entity-row">
                  <span className="entity-type">{e.entity_type}</span>
                  <span className="entity-value">{e.normalized}</span>
                  <span className="entity-conf">
                    {Math.round(e.confidence * 100)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {error && <div className="error-box">⚠️ {error}</div>}

          <div className="button-row">
            <button className="btn btn-primary" onClick={handleStart} disabled={status === 'listening'}>
              🎙️ Start Listening
            </button>
            <button className="btn btn-secondary" onClick={handleStop} disabled={status !== 'listening'}>
              ⏹️ Stop
            </button>
          </div>

          {transcript && (
            <button className="btn btn-clear" onClick={handleClear}>🗑️ Clear</button>
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

      <p className="popup-footer">Phase 3 — Form Detection</p>
    </div>
  )
}

export default Popup