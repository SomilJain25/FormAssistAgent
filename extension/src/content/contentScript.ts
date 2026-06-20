// contentScript.ts
// Phase 2: Speech Recognition
// Phase 3: Form Detection
// Phase 6: Auto Form Filling

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DetectedField {
  index: number
  fieldId: string
  label: string
  placeholder: string
  name: string
  id: string
  type: string
  tagName: string
  value: string
}

export interface FillInstruction {
  fieldId: string   // matches DetectedField.fieldId
  value: string     // value to fill
}

export interface FillResult {
  fieldId: string
  success: boolean
  message: string
}

// ─── Form Scanner (Phase 3) ───────────────────────────────────────────────────

function getLabelForElement(el: HTMLElement): string {
  if (el.id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${el.id}"]`)
    if (label) return label.innerText.trim()
  }
  const ariaLabel = el.getAttribute('aria-label')
  if (ariaLabel) return ariaLabel.trim()

  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy)
    if (labelEl) return labelEl.innerText.trim()
  }
  const title = el.getAttribute('title')
  if (title) return title.trim()

  const closestLabel = el.closest('label')
  if (closestLabel) {
    const clone = closestLabel.cloneNode(true) as HTMLElement
    clone.querySelectorAll('input, select, textarea').forEach(n => n.remove())
    const text = clone.innerText.trim()
    if (text) return text
  }
  const prev = el.previousElementSibling
  if (prev && ['LABEL','SPAN','P','DIV','TD','TH'].includes(prev.tagName)) {
    const text = (prev as HTMLElement).innerText.trim()
    if (text.length < 60) return text
  }
  return ''
}

function scanFormFields(): DetectedField[] {
  const selector = [
    'input:not([type="hidden"])',
    'input:not([type="submit"])',
    'input:not([type="button"])',
    'input:not([type="reset"])',
    'input:not([type="image"])',
    'textarea',
    'select',
  ].join(', ')

  const elements = Array.from(
    document.querySelectorAll<HTMLElement>(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), textarea, select'
    )
  )

  const fields: DetectedField[] = []

  elements.forEach((el, index) => {
    const style = window.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') return
    if ((el as HTMLInputElement).disabled) return

    const input       = el as HTMLInputElement
    const label       = getLabelForElement(el)
    const placeholder = input.placeholder || ''
    const name        = input.name        || ''
    const id          = input.id          || ''
    const type        = input.type        || el.tagName.toLowerCase()
    const tagName     = el.tagName
    const value       = input.value       || ''

    if (!label && !placeholder && !name && !id) return

    const fieldId = id || name || `field_${index}`
    fields.push({ index, fieldId, label, placeholder, name, id, type, tagName, value })
  })

  return fields
}

// ─── Autofill Engine (Phase 6) ────────────────────────────────────────────────

/**
 * Fire all events a real user interaction would fire.
 * This makes React, Angular, Vue detect the value change.
 */
function triggerInputEvents(el: HTMLElement): void {
  const events = ['input', 'change', 'blur', 'keyup']
  events.forEach(eventName => {
    el.dispatchEvent(new Event(eventName, { bubbles: true }))
  })

  // React-specific: override the value setter to trigger synthetic events
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set

  const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set

  if (el.tagName === 'INPUT' && nativeInputValueSetter) {
    nativeInputValueSetter.call(el, (el as HTMLInputElement).value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }

  if (el.tagName === 'TEXTAREA' && nativeTextareaSetter) {
    nativeTextareaSetter.call(el, (el as HTMLTextAreaElement).value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

/**
 * Find a form element by fieldId.
 * Tries: id → name → nth-field fallback
 */
function findElement(fieldId: string): HTMLElement | null {
  // Try by id first
  let el = document.getElementById(fieldId)
  if (el) return el

  // Try by name
  el = document.querySelector(`[name="${fieldId}"]`)
  if (el) return el

  // Try data-field-id
  el = document.querySelector(`[data-field-id="${fieldId}"]`)
  if (el) return el

  return null
}

/**
 * Fill a single text input or textarea.
 */
function fillTextInput(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  el.focus()
  el.value = value
  triggerInputEvents(el)
}

/**
 * Fill a <select> dropdown.
 * Tries exact match → case-insensitive → partial match.
 */
function fillSelect(el: HTMLSelectElement, value: string): boolean {
  const options = Array.from(el.options)
  const valueLower = value.toLowerCase()

  // Exact match
  let match = options.find(o => o.value === value || o.text === value)

  // Case-insensitive
  if (!match) {
    match = options.find(
      o => o.value.toLowerCase() === valueLower ||
           o.text.toLowerCase()  === valueLower
    )
  }

  // Partial match
  if (!match) {
    match = options.find(
      o => o.value.toLowerCase().includes(valueLower) ||
           o.text.toLowerCase().includes(valueLower)
    )
  }

  if (match) {
    el.value = match.value
    triggerInputEvents(el)
    return true
  }
  return false
}

/**
 * Fill radio buttons — find the radio with matching value/label.
 */
function fillRadio(name: string, value: string): boolean {
  const radios = Array.from(
    document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${name}"]`)
  )
  const valueLower = value.toLowerCase()

  const match = radios.find(
    r => r.value.toLowerCase() === valueLower ||
         getLabelForElement(r).toLowerCase().includes(valueLower)
  )

  if (match) {
    match.checked = true
    triggerInputEvents(match)
    return true
  }
  return false
}

/**
 * Fill checkboxes — check if value is truthy.
 */
function fillCheckbox(el: HTMLInputElement, value: string): void {
  const truthy = ['true', 'yes', '1', 'checked', 'on']
  el.checked = truthy.includes(value.toLowerCase())
  triggerInputEvents(el)
}

/**
 * Master fill function — routes to correct filler based on field type.
 */
function fillField(instruction: FillInstruction): FillResult {
  const { fieldId, value } = instruction

  const el = findElement(fieldId)

  if (!el) {
    return {
      fieldId,
      success: false,
      message: `Element not found: ${fieldId}`,
    }
  }

  const tagName = el.tagName
  const type    = (el as HTMLInputElement).type?.toLowerCase() || ''

  try {
    // SELECT dropdown
    if (tagName === 'SELECT') {
      const filled = fillSelect(el as HTMLSelectElement, value)
      return {
        fieldId,
        success: filled,
        message: filled ? 'Filled select' : `No matching option for: ${value}`,
      }
    }

    // TEXTAREA
    if (tagName === 'TEXTAREA') {
      fillTextInput(el as HTMLTextAreaElement, value)
      return { fieldId, success: true, message: 'Filled textarea' }
    }

    // Radio buttons
    if (type === 'radio') {
      const name = (el as HTMLInputElement).name
      const filled = fillRadio(name, value)
      return {
        fieldId,
        success: filled,
        message: filled ? 'Filled radio' : `No matching radio for: ${value}`,
      }
    }

    // Checkboxes
    if (type === 'checkbox') {
      fillCheckbox(el as HTMLInputElement, value)
      return { fieldId, success: true, message: 'Filled checkbox' }
    }

    // All other inputs (text, email, tel, number, date, password...)
    fillTextInput(el as HTMLInputElement, value)

    // For date inputs, also try setting via valueAsDate
    if (type === 'date') {
      const parts = value.split(/[-/]/)
      if (parts.length === 3) {
        // Try DD-MM-YYYY → YYYY-MM-DD (HTML date format)
        let formatted = value
        if (parts[0].length <= 2) {
          formatted = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`
        }
        ;(el as HTMLInputElement).value = formatted
        triggerInputEvents(el)
      }
    }

    return { fieldId, success: true, message: `Filled ${type || 'text'} input` }

  } catch (err) {
    return {
      fieldId,
      success: false,
      message: `Fill error: ${String(err)}`,
    }
  }
}

/**
 * Fill multiple fields at once.
 * Shows a brief highlight on each filled field.
 */
function fillAllFields(instructions: FillInstruction[]): FillResult[] {
  const results: FillResult[] = []

  instructions.forEach((instruction, i) => {
    // Stagger fills slightly so page doesn't get overwhelmed
    setTimeout(() => {
      const result = fillField(instruction)
      results.push(result)

      // Visual highlight on filled field
      if (result.success) {
        const el = findElement(instruction.fieldId)
        if (el) {
          const original = el.style.cssText
          el.style.outline     = '2px solid #4caf50'
          el.style.background  = '#f1f8e9'
          el.style.transition  = 'all 0.3s'
          setTimeout(() => {
            el.style.cssText = original
          }, 2000)
        }
      }
    }, i * 80)  // 80ms stagger between fills
  })

  return results
}

// ─── Speech Recognition (Phase 2, fixed) ─────────────────────────────────────

let recognition: any = null
let isListening = false
let userRequestedStop = false

const SpeechRecognition =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

function startRecognition(lang: string) {
  if (!SpeechRecognition) {
    chrome.runtime.sendMessage({ type: 'SPEECH_ERROR', error: 'Not supported.' })
    return
  }
  if (isListening) return

  userRequestedStop = false

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
      const r = event.results[i]
      if (r.isFinal) finalText += r[0].transcript + ' '
      else interimText += r[0].transcript
    }
    chrome.runtime.sendMessage({
      type: 'SPEECH_RESULT',
      finalText: finalText.trim(),
      interimText: interimText.trim(),
    })
  }

  recognition.onerror = (event: any) => {
    // Silent auto-recovery for false-alarm silence detection
    if (event.error === 'no-speech' && !userRequestedStop) {
      try {
        recognition.stop()
      } catch {}
      return // onend will handle the restart
    }

    if (event.error === 'aborted') {
      return // expected when we call stop() ourselves
    }

    const msgs: Record<string, string> = {
      'not-allowed':   'Microphone denied. Click 🔒 → allow microphone.',
      'network':       'Network error. Check your connection.',
      'audio-capture': 'No microphone found.',
    }
    chrome.runtime.sendMessage({
      type: 'SPEECH_ERROR',
      error: msgs[event.error] || `Error: ${event.error}`,
    })
    isListening = false
  }

  recognition.onend = () => {
    if (!userRequestedStop) {
      // Auto-restart — Chrome ends sessions on silence even with continuous:true
      try {
        recognition.start()
        return // stay in "listening" state from the popup's perspective
      } catch {
        isListening = false
      }
    }
    isListening = false
    chrome.runtime.sendMessage({ type: 'SPEECH_STOPPED' })
  }

  try {
    recognition.start()
  } catch {
    chrome.runtime.sendMessage({ type: 'SPEECH_ERROR', error: 'Could not start mic.' })
  }
}

function stopRecognition() {
  userRequestedStop = true
  if (recognition && isListening) {
    recognition.stop()
  }
}

// ─── Message Listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'PING':
      sendResponse({ alive: true })
      break

    case 'START_LISTENING':
      startRecognition(message.lang || 'en-IN')
      break

    case 'STOP_LISTENING':
      stopRecognition()
      break

    case 'SCAN_FIELDS':
      const fields = scanFormFields()
      sendResponse({ fields })
      chrome.runtime.sendMessage({ type: 'FIELDS_DETECTED', fields })
      break

    case 'FILL_FIELDS':
      const results = fillAllFields(message.instructions || [])
      sendResponse({ results })
      chrome.runtime.sendMessage({ type: 'FILL_COMPLETE', results })
      break
  }
  return true
})

chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' })