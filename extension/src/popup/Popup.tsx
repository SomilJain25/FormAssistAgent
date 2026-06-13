import React, { useState, useEffect } from 'react'

type SupportedLanguage = 'en-IN' | 'hi-IN' | 'en-US'
type Status = 'idle' | 'listening' | 'error'

const LANGUAGES: { label: string; value: SupportedLanguage }[] = [
  { label: '🇮🇳 English (India)', value: 'en-IN' },
  { label: '🇮🇳 Hindi',           value: 'hi-IN' },
  { label: '🌐 English (US)',      value: 'en-US' },
]

const Popup: React.FC = () => {
  const [status, setStatus]               = useState<Status>('idle')
  const [language, setLanguage]           = useState<SupportedLanguage>('en-IN')
  const [transcript, setTranscript]       = useState('')
  const [interimText, setInterimText]     = useState('')
  const [error, setError]                 = useState<string | null>(null)

  useEffect(() => {
    // Listen for messages coming back from the content script
    const handler = (message: any) => {
      switch (message.type) {
        case 'SPEECH_STARTED':
          setStatus('listening')
          setError(null)
          break

        case 'SPEECH_RESULT':
          if (message.finalText) {
            setTranscript(prev => (prev + ' ' + message.finalText).trim())
          }
          setInterimText(message.interimText || '')
          break

        case 'SPEECH_STOPPED':
          setStatus('idle')
          setInterimText('')
          break

        case 'SPEECH_ERROR':
          setStatus('error')
          setError(message.error)
          setInterimText('')
          break
      }
    }

    chrome.runtime.onMessage.addListener(handler)
    return () => chrome.runtime.onMessage.removeListener(handler)
  }, [])

  const sendToContentScript = (type: string, extra = {}) => {
    // Send message to the active tab's content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id
      if (tabId == null) {
        setError('No active tab found. Open a webpage first.')
        return
      }
      chrome.tabs.sendMessage(tabId, { type, ...extra }, (response) => {
        if (chrome.runtime.lastError) {
          setError('Could not connect to page. Please refresh the page and try again.')
        }
      })
    })
  }

  const handleStart = () => {
    setError(null)
    sendToContentScript('START_LISTENING', { lang: language })
  }

  const handleStop = () => {
    sendToContentScript('STOP_LISTENING')
  }

  const handleClear = () => {
    setTranscript('')
    setInterimText('')
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

      {/* Language selector */}
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

      {/* Status badge */}
      <div className={`status-badge status-${status}`}>
        {status === 'listening' ? '🔴 Listening...' : status === 'error' ? '❌ Error' : '⚪ Ready'}
      </div>

      {/* Transcript box */}
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
              : 'Click "Start Listening" then speak naturally.'}
          </p>
        )}
      </div>

      {/* Error */}
      {error && <div className="error-box">⚠️ {error}</div>}

      {/* Buttons */}
      <div className="button-row">
        <button
          className="btn btn-primary"
          onClick={handleStart}
          disabled={status === 'listening'}
        >
          🎙️ Start Listening
        </button>
        <button
          className="btn btn-secondary"
          onClick={handleStop}
          disabled={status !== 'listening'}
        >
          ⏹️ Stop
        </button>
      </div>

      {transcript && (
        <button className="btn btn-clear" onClick={handleClear}>
          🗑️ Clear transcript
        </button>
      )}

      {transcript && status === 'idle' && (
        <div className="next-step-hint">
          ✅ Transcript ready — NLP extraction in Phase 4
        </div>
      )}

      <p className="popup-footer">Phase 2 — Speech Recognition</p>
    </div>
  )
}

export default Popup