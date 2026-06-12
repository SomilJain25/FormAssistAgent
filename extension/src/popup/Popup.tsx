import React, { useState } from 'react'
import useSpeechRecognition, { SupportedLanguage } from '../hooks/useSpeechRecognition'

const LANGUAGES: { label: string; value: SupportedLanguage }[] = [
  { label: '🇮🇳 English (India)', value: 'en-IN' },
  { label: '🇮🇳 Hindi',           value: 'hi-IN' },
  { label: '🌐 English (US)',      value: 'en-US' },
]

const Popup: React.FC = () => {
  const [language, setLanguage] = useState<SupportedLanguage>('en-IN')

  const {
    isListening,
    transcript,
    interimTranscript,
    error,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition()

  // Combined display text: confirmed + live interim
  const displayText = transcript + (interimTranscript ? ' ' + interimTranscript : '')

  if (!isSupported) {
    return (
      <div className="popup-container">
        <div className="unsupported">
          ⚠️ Web Speech API not supported in this browser.
          Please use Chrome.
        </div>
      </div>
    )
  }

  return (
    <div className="popup-container">
      {/* Header */}
      <div className="popup-header">
        <div className={`logo ${isListening ? 'logo-pulse' : ''}`}>🎤</div>
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
          disabled={isListening}
        >
          {LANGUAGES.map(l => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </div>

      {/* Status badge */}
      <div className={`status-badge ${isListening ? 'status-listening' : 'status-idle'}`}>
        {isListening ? '🔴 Listening...' : '⚪ Ready'}
      </div>

      {/* Transcript box */}
      <div className={`transcript-box ${isListening ? 'transcript-active' : ''}`}>
        {displayText ? (
          <>
            {/* Confirmed text */}
            {transcript && (
              <span className="transcript-final">{transcript}</span>
            )}
            {/* Live interim text */}
            {interimTranscript && (
              <span className="transcript-interim"> {interimTranscript}</span>
            )}
          </>
        ) : (
          <p className="transcript-placeholder">
            {isListening
              ? 'Start speaking...'
              : 'Click "Start Listening" then speak naturally.'
            }
          </p>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="error-box">
          ⚠️ {error}
        </div>
      )}

      {/* Buttons */}
      <div className="button-row">
        <button
          className="btn btn-primary"
          onClick={() => startListening(language)}
          disabled={isListening}
        >
          🎙️ Start Listening
        </button>
        <button
          className="btn btn-secondary"
          onClick={stopListening}
          disabled={!isListening}
        >
          ⏹️ Stop
        </button>
      </div>

      {/* Clear button — only show when there's text */}
      {transcript && (
        <button className="btn btn-clear" onClick={resetTranscript}>
          🗑️ Clear transcript
        </button>
      )}

      {/* Send to backend preview — Phase 4 will wire this up */}
      {transcript && !isListening && (
        <div className="next-step-hint">
          ✅ Transcript ready — NLP extraction in Phase 4
        </div>
      )}

      <p className="popup-footer">Phase 2 — Speech Recognition</p>
    </div>
  )
}

export default Popup