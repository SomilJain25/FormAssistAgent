import React, { useState } from 'react'

// Status type for type safety
type Status = 'idle' | 'listening' | 'processing'

const Popup: React.FC = () => {
  const [status, setStatus] = useState<Status>('idle')
  const [transcript, setTranscript] = useState<string>('')

  const handleStartListening = () => {
    setStatus('listening')
    setTranscript('')
    // Speech recognition will be wired up in Phase 2
    console.log('Voice Form Assistant: Start listening triggered')
  }

  const handleStopListening = () => {
    setStatus('idle')
    console.log('Voice Form Assistant: Stop listening triggered')
  }

  const getStatusLabel = (): string => {
    switch (status) {
      case 'listening': return '🎙️ Listening...'
      case 'processing': return '⚙️ Processing...'
      default: return 'Ready'
    }
  }

  return (
    <div className="popup-container">
      {/* Header */}
      <div className="popup-header">
        <div className="logo">🎤</div>
        <div>
          <h1 className="popup-title">Voice Form Assistant</h1>
          <p className="popup-subtitle">Speak to fill any form</p>
        </div>
      </div>

      {/* Status badge */}
      <div className={`status-badge status-${status}`}>
        {getStatusLabel()}
      </div>

      {/* Transcript area — will show live text in Phase 2 */}
      <div className="transcript-box">
        {transcript
          ? <p className="transcript-text">{transcript}</p>
          : <p className="transcript-placeholder">Your spoken words will appear here...</p>
        }
      </div>

      {/* Action buttons */}
      <div className="button-row">
        <button
          className="btn btn-primary"
          onClick={handleStartListening}
          disabled={status === 'listening'}
        >
          🎙️ Start Listening
        </button>
        <button
          className="btn btn-secondary"
          onClick={handleStopListening}
          disabled={status === 'idle'}
        >
          ⏹️ Stop
        </button>
      </div>

      {/* Footer */}
      <p className="popup-footer">Phase 1 — Extension Foundation</p>
    </div>
  )
}

export default Popup