// contentScript.ts
// Runs on the actual webpage — mic access works here

let recognition: any = null
let isListening = false

const SpeechRecognition =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

function startRecognition(lang: string) {
  if (!SpeechRecognition) {
    chrome.runtime.sendMessage({
      type: 'SPEECH_ERROR',
      error: 'Speech recognition not supported in this browser.',
    })
    return
  }

  if (isListening) return

  recognition = new SpeechRecognition()
  recognition.lang = lang
  recognition.continuous = true
  recognition.interimResults = true
  recognition.maxAlternatives = 1

  recognition.onstart = () => {
    isListening = true
    chrome.runtime.sendMessage({ type: 'SPEECH_STARTED' })
  }

  recognition.onresult = (event: any) => {
    let finalText = ''
    let interimText = ''

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      const text = result[0].transcript
      if (result.isFinal) {
        finalText += text + ' '
      } else {
        interimText += text
      }
    }

    chrome.runtime.sendMessage({
      type: 'SPEECH_RESULT',
      finalText: finalText.trim(),
      interimText: interimText.trim(),
    })
  }

  recognition.onerror = (event: any) => {
    let message = ''
    switch (event.error) {
      case 'not-allowed':
        message = 'Microphone permission denied. Click the 🔒 icon in the address bar and allow microphone.'
        break
      case 'no-speech':
        message = 'No speech detected. Please try again.'
        break
      case 'network':
        message = 'Network error. Check your internet connection.'
        break
      case 'audio-capture':
        message = 'No microphone found on this device.'
        break
      default:
        message = `Speech error: ${event.error}`
    }
    chrome.runtime.sendMessage({ type: 'SPEECH_ERROR', error: message })
    isListening = false
  }

  recognition.onend = () => {
    isListening = false
    chrome.runtime.sendMessage({ type: 'SPEECH_STOPPED' })
  }

  try {
    recognition.start()
  } catch (err) {
    chrome.runtime.sendMessage({
      type: 'SPEECH_ERROR',
      error: 'Could not start microphone. Reload the page and try again.',
    })
  }
}

function stopRecognition() {
  if (recognition && isListening) {
    recognition.stop()
  }
}

// Listen for commands from the popup
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'START_LISTENING') {
    startRecognition(message.lang || 'en-IN')
  }
  if (message.type === 'STOP_LISTENING') {
    stopRecognition()
  }
})

// Tell popup the content script is ready
chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' })