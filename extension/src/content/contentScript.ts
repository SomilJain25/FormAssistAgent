// contentScript.ts
// Handles: Speech Recognition (Phase 2) + Form Detection (Phase 3)

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DetectedField {
  index: number
  fieldId: string       // unique key we assign
  label: string         // best human-readable label we could find
  placeholder: string
  name: string
  id: string
  type: string          // text, email, tel, select, textarea ...
  tagName: string       // INPUT, TEXTAREA, SELECT
  value: string         // current value if any
}

// ─── Form Scanner ─────────────────────────────────────────────────────────────

/**
 * Walk the DOM and find the best label text for an element.
 * Priority: <label for="id"> → aria-label → title → closest <label> wrapper
 */
function getLabelForElement(el: HTMLElement): string {
  // 1. <label for="elementId">
  if (el.id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${el.id}"]`)
    if (label) return label.innerText.trim()
  }

  // 2. aria-label attribute
  const ariaLabel = el.getAttribute('aria-label')
  if (ariaLabel) return ariaLabel.trim()

  // 3. aria-labelledby → find that element's text
  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy)
    if (labelEl) return labelEl.innerText.trim()
  }

  // 4. title attribute
  const title = el.getAttribute('title')
  if (title) return title.trim()

  // 5. Closest wrapping <label>
  const closestLabel = el.closest('label')
  if (closestLabel) {
    // Remove the input's own text from label text
    const clone = closestLabel.cloneNode(true) as HTMLElement
    clone.querySelectorAll('input, select, textarea').forEach(n => n.remove())
    const text = clone.innerText.trim()
    if (text) return text
  }

  // 6. Previous sibling text (common in simple forms)
  const prev = el.previousElementSibling
  if (prev && ['LABEL', 'SPAN', 'P', 'DIV', 'TD', 'TH'].includes(prev.tagName)) {
    const text = (prev as HTMLElement).innerText.trim()
    if (text.length < 60) return text   // sanity limit
  }

  return ''
}

/**
 * Scan the page for all visible, interactable form fields.
 * Returns a clean array of DetectedField objects.
 */
function scanFormFields(): DetectedField[] {
  const selector = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), textarea, select'
  const elements = Array.from(document.querySelectorAll<HTMLElement>(selector))

  const fields: DetectedField[] = []

  elements.forEach((el, index) => {
    // Skip invisible elements
    const style = window.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') return
    if ((el as HTMLInputElement).disabled) return

    const input = el as HTMLInputElement

    const label       = getLabelForElement(el)
    const placeholder = input.placeholder || ''
    const name        = input.name        || ''
    const id          = input.id          || ''
    const type        = input.type        || el.tagName.toLowerCase()
    const tagName     = el.tagName
    const value       = input.value       || ''

    // Skip if we have zero identifying information
    if (!label && !placeholder && !name && !id) return

    // Assign a stable unique key
    const fieldId = id || name || `field_${index}`

    fields.push({
      index,
      fieldId,
      label,
      placeholder,
      name,
      id,
      type,
      tagName,
      value,
    })
  })

  return fields
}

// ─── Speech Recognition (Phase 2 — unchanged) ────────────────────────────────

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
      if (result.isFinal) finalText += text + ' '
      else interimText += text
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
        message = 'Microphone permission denied. Click 🔒 in address bar → allow microphone.'
        break
      case 'no-speech':   message = 'No speech detected. Please try again.'; break
      case 'network':     message = 'Network error. Check your connection.'; break
      case 'audio-capture': message = 'No microphone found.'; break
      default: message = `Speech error: ${event.error}`
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
  if (recognition && isListening) recognition.stop()
}

// ─── Message Listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'START_LISTENING':
      startRecognition(message.lang || 'en-IN')
      break

    case 'STOP_LISTENING':
      stopRecognition()
      break

    case 'SCAN_FIELDS':
      // Scan the page and send results back immediately via sendResponse
      const fields = scanFormFields()
      sendResponse({ fields })
      // Also broadcast so popup can listen via onMessage
      chrome.runtime.sendMessage({ type: 'FIELDS_DETECTED', fields })
      break
  }

  return true // keep message channel open for async sendResponse
})

chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' })