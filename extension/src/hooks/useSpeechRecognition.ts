import { useState, useEffect, useRef, useCallback } from 'react'

// Tell TypeScript about the Web Speech API (not in default lib)
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message: string
}

interface ISpeechRecognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: ((event: Event) => void) | null
  onstart: ((event: Event) => void) | null
}

declare global {
  interface Window {
    SpeechRecognition: new () => ISpeechRecognition
    webkitSpeechRecognition: new () => ISpeechRecognition
  }
}

// Supported languages
export type SupportedLanguage = 'en-IN' | 'hi-IN' | 'en-US'

export interface SpeechRecognitionState {
  isListening: boolean
  transcript: string        // final confirmed text
  interimTranscript: string // live unconfirmed text
  error: string | null
  isSupported: boolean
}

export interface SpeechRecognitionControls {
  startListening: (lang?: SupportedLanguage) => void
  stopListening: () => void
  resetTranscript: () => void
}

const useSpeechRecognition = (): SpeechRecognitionState & SpeechRecognitionControls => {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<ISpeechRecognition | null>(null)

  // Check browser support
  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  // Initialize the recognition engine once
  useEffect(() => {
    if (!isSupported) return

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition

    const recognition = new SpeechRecognition()
    recognition.continuous = true        // keep listening until stopped
    recognition.interimResults = true    // show live partial results
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setIsListening(true)
      setError(null)
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = ''
      let interimText = ''

      // Loop through all results from the current session
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0].transcript

        if (result.isFinal) {
          finalText += text + ' '
        } else {
          interimText += text
        }
      }

      if (finalText) {
        // Append confirmed text to existing transcript
        setTranscript(prev => (prev + finalText).trim())
      }
      setInterimTranscript(interimText)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error)
      switch (event.error) {
        case 'not-allowed':
          setError('Microphone permission denied. Please allow mic access.')
          break
        case 'no-speech':
          setError('No speech detected. Please try again.')
          break
        case 'network':
          setError('Network error. Check your internet connection.')
          break
        case 'audio-capture':
          setError('No microphone found.')
          break
        default:
          setError(`Error: ${event.error}`)
      }
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
      setInterimTranscript('')
    }

    recognitionRef.current = recognition

    // Cleanup on unmount
    return () => {
      recognition.abort()
    }
  }, [isSupported])

  const startListening = useCallback((lang: SupportedLanguage = 'en-IN') => {
    if (!recognitionRef.current || isListening) return
    setError(null)
    setInterimTranscript('')
    recognitionRef.current.lang = lang
    try {
      recognitionRef.current.start()
    } catch (err) {
      console.error('Failed to start recognition:', err)
    }
  }, [isListening])

  const stopListening = useCallback(() => {
    if (!recognitionRef.current || !isListening) return
    recognitionRef.current.stop()
  }, [isListening])

  const resetTranscript = useCallback(() => {
    setTranscript('')
    setInterimTranscript('')
    setError(null)
  }, [])

  return {
    isListening,
    transcript,
    interimTranscript,
    error,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  }
}

export default useSpeechRecognition