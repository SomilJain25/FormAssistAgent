// contentScript.ts
// Runs inside every web page. Responsibilities:
//   1. Form scanning  — find fillable fields and describe them
//   2. Autofill       — write values so React/Angular/Vue notice them
//   3. Speech         — Web Speech API (runs here so the mic prompt belongs to the page)

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
  fieldId: string
  value: string
}

export interface FillResult {
  fieldId: string
  success: boolean
  message: string
}

// Guard: the script can be injected twice (manifest + popup fallback).
// A second copy would double every message handler → double fills / two mics.
const w = window as any
if (w.__vfaContentScriptLoaded) {
  // already running — do nothing
} else {
  w.__vfaContentScriptLoaded = true
  main()
}

function main() {
  const ATTR = 'data-vfa-id'

  const esc = (v: string) =>
    typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(v) : v.replace(/["\\]/g, '\\$&')

  const textOf = (el: Element | null) =>
    ((el as HTMLElement | null)?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim()

  // ─── Form scanner ───────────────────────────────────────────────────────────

  function getLabelForElement(el: HTMLElement): string {
    if (el.id) {
      const label = document.querySelector<HTMLLabelElement>(`label[for="${esc(el.id)}"]`)
      if (label) {
        const t = textOf(label)
        if (t) return t
      }
    }
    const ariaLabel = el.getAttribute('aria-label')
    if (ariaLabel?.trim()) return ariaLabel.trim()

    const labelledBy = el.getAttribute('aria-labelledby')
    if (labelledBy) {
      const t = labelledBy
        .split(/\s+/)
        .map(id => textOf(document.getElementById(id)))
        .filter(Boolean)
        .join(' ')
      if (t) return t
    }

    const closestLabel = el.closest('label')
    if (closestLabel) {
      const clone = closestLabel.cloneNode(true) as HTMLElement
      clone.querySelectorAll('input, select, textarea').forEach(n => n.remove())
      const t = textOf(clone)
      if (t) return t
    }

    const title = el.getAttribute('title')
    if (title?.trim()) return title.trim()

    // Preceding sibling / parent's preceding sibling (common in table & div layouts)
    const candidates: (Element | null)[] = [
      el.previousElementSibling,
      el.parentElement?.previousElementSibling ?? null,
    ]
    if ((el as HTMLInputElement).placeholder) return '' // placeholder is sent separately and is more reliable
    for (const c of candidates) {
      if (c && !c.querySelector('input, select, textarea') && c.tagName !== 'FORM' && ['LABEL', 'SPAN', 'P', 'DIV', 'TD', 'TH', 'LEGEND', 'H4', 'H5', 'H6'].includes(c.tagName)) {
        const t = textOf(c)
        if (t && t.length < 60) return t
      }
    }
    return ''
  }

  function groupLabel(radio: HTMLInputElement): string {
    const fs = radio.closest('fieldset')
    const legend = fs?.querySelector('legend')
    if (legend) return textOf(legend)
    const group = radio.closest('[role="radiogroup"]')
    const lbl = group?.getAttribute('aria-label') || textOf(document.getElementById(group?.getAttribute('aria-labelledby') || ''))
    if (lbl) return lbl
    return radio.name.replace(/[_\-]+/g, ' ')
  }

  function isVisible(el: HTMLElement): boolean {
    const style = window.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    const rect = el.getBoundingClientRect()
    // custom checkboxes/radios are often 0×0 but still fillable — only drop other inputs
    if (rect.width === 0 && rect.height === 0 && !['checkbox', 'radio'].includes((el as HTMLInputElement).type)) {
      return false
    }
    return true
  }

  function scanFormFields(): DetectedField[] {
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]):not([type="file"]):not([type="password"]), textarea, select'
      )
    )

    const fields: DetectedField[] = []
    const seenRadioGroups = new Set<string>()
    let counter = 0

    // clear stale tags from a previous scan
    document.querySelectorAll(`[${ATTR}]`).forEach(n => n.removeAttribute(ATTR))

    elements.forEach((el, index) => {
      const input = el as HTMLInputElement
      if (input.disabled || input.readOnly) return
      if (!isVisible(el)) return

      const type = input.type || el.tagName.toLowerCase()

      // One entry per radio group
      if (type === 'radio' && input.name) {
        if (seenRadioGroups.has(input.name)) return
        seenRadioGroups.add(input.name)
      }

      const label = type === 'radio' && input.name ? groupLabel(input) : getLabelForElement(el)
      const placeholder = input.placeholder || ''
      const name = input.name || ''
      const id = input.id || ''

      if (!label && !placeholder && !name && !id) return

      // Unique, resolvable id: we tag the element itself so fills never rely on guesses
      let fieldId = id || name || `field_${index}`
      if (fields.some(f => f.fieldId === fieldId) && type !== 'radio') fieldId = `${fieldId}__${counter++}`
      el.setAttribute(ATTR, fieldId)

      fields.push({
        index,
        fieldId,
        label,
        placeholder,
        name,
        id,
        type,
        tagName: el.tagName,
        value: input.value || '',
      })
    })

    return fields
  }

  // ─── Autofill engine ────────────────────────────────────────────────────────

  /** Set a value the way a user typing would, so React/Vue/Angular see it. */
  function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
    const proto =
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    if (setter) setter.call(el, value)
    else el.value = value
  }

  function fireEvents(el: HTMLElement) {
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    el.dispatchEvent(new Event('blur', { bubbles: true }))
  }

  function findElement(fieldId: string): HTMLElement | null {
    return (
      document.querySelector<HTMLElement>(`[${ATTR}="${esc(fieldId)}"]`) ||
      document.getElementById(fieldId) ||
      document.querySelector<HTMLElement>(`[name="${esc(fieldId)}"]`)
    )
  }

  /** DD-MM-YYYY / DD/MM/YYYY / 15 Aug 1999 → YYYY-MM-DD (what <input type=date> needs). */
  function toIsoDate(value: string): string | null {
    const v = value.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
    const m = v.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/)
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    const d = new Date(v)
    if (!isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    return null
  }

  function fillSelect(el: HTMLSelectElement, value: string): boolean {
    const v = value.trim().toLowerCase()
    const options = Array.from(el.options).filter(o => o.value !== '' || o.text.trim() !== '')
    const match =
      options.find(o => o.value === value || o.text === value) ||
      options.find(o => o.value.toLowerCase() === v || o.text.trim().toLowerCase() === v) ||
      options.find(o => v.length >= 2 && (o.text.toLowerCase().includes(v) || o.value.toLowerCase().includes(v)))
    if (!match) return false
    setNativeValue(el, match.value)
    fireEvents(el)
    return true
  }

  function fillRadio(el: HTMLInputElement, value: string): boolean {
    const v = value.trim().toLowerCase()
    const radios = Array.from(
      document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${esc(el.name)}"]`)
    )
    const match =
      radios.find(r => r.value.toLowerCase() === v || getLabelForElement(r).toLowerCase() === v) ||
      radios.find(r => getLabelForElement(r).toLowerCase().includes(v) || r.value.toLowerCase().includes(v))
    if (!match) return false
    match.click() // click() sets checked AND fires the events frameworks listen for
    return true
  }

  function fillCheckbox(el: HTMLInputElement, value: string) {
    const want = ['true', 'yes', '1', 'checked', 'on', 'हाँ', 'हां'].includes(value.trim().toLowerCase())
    if (el.checked !== want) el.click()
  }

  function fillField({ fieldId, value }: FillInstruction): FillResult {
    const el = findElement(fieldId)
    if (!el) return { fieldId, success: false, message: `Element not found: ${fieldId}` }

    const tag = el.tagName
    const type = ((el as HTMLInputElement).type || '').toLowerCase()

    try {
      if (tag === 'SELECT') {
        const ok = fillSelect(el as HTMLSelectElement, value)
        return { fieldId, success: ok, message: ok ? 'Filled select' : `No option matches "${value}"` }
      }
      if (type === 'radio') {
        const ok = fillRadio(el as HTMLInputElement, value)
        return { fieldId, success: ok, message: ok ? 'Selected radio' : `No radio matches "${value}"` }
      }
      if (type === 'checkbox') {
        fillCheckbox(el as HTMLInputElement, value)
        return { fieldId, success: true, message: 'Set checkbox' }
      }

      let finalValue = value
      if (type === 'date') {
        const iso = toIsoDate(value)
        if (!iso) return { fieldId, success: false, message: `Could not read date "${value}"` }
        finalValue = iso
      }
      if (type === 'number') {
        finalValue = value.replace(/[^\d.\-]/g, '')
      }

      ;(el as HTMLInputElement).focus()
      setNativeValue(el as HTMLInputElement | HTMLTextAreaElement, finalValue)
      fireEvents(el)
      return { fieldId, success: true, message: `Filled ${type || 'text'}` }
    } catch (err) {
      return { fieldId, success: false, message: `Fill error: ${String(err)}` }
    }
  }

  function highlight(el: HTMLElement) {
    const prev = { outline: el.style.outline, background: el.style.backgroundColor, transition: el.style.transition }
    el.style.transition = 'all .3s'
    el.style.outline = '2px solid #4caf50'
    el.style.backgroundColor = '#f1f8e9'
    setTimeout(() => {
      el.style.outline = prev.outline
      el.style.backgroundColor = prev.background
      el.style.transition = prev.transition
    }, 2000)
  }

  /** Fills synchronously so the real results can be returned to the popup. */
  function fillAllFields(instructions: FillInstruction[]): FillResult[] {
    return instructions.map(instruction => {
      const result = fillField(instruction)
      if (result.success) {
        const el = findElement(instruction.fieldId)
        if (el) highlight(el)
      }
      return result
    })
  }

  // ─── Speech recognition ─────────────────────────────────────────────────────

  const SpeechRecognitionCtor = w.SpeechRecognition || w.webkitSpeechRecognition

  let recognition: any = null
  let isListening = false
  let userRequestedStop = false

  const notify = (msg: object) => {
    try {
      chrome.runtime.sendMessage(msg, () => void chrome.runtime.lastError)
    } catch {
      /* extension was reloaded; this orphaned script is harmless */
    }
  }

  function startRecognition(lang: string) {
    if (!SpeechRecognitionCtor) {
      notify({ type: 'SPEECH_ERROR', error: 'Speech recognition is not supported in this browser. Use Google Chrome.' })
      return
    }
    if (!window.isSecureContext) {
      notify({ type: 'SPEECH_ERROR', error: 'The microphone only works on https:// pages. Open the form over https.' })
      return
    }
    if (isListening) return

    userRequestedStop = false
    recognition = new SpeechRecognitionCtor()
    recognition.lang = lang
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      isListening = true
      notify({ type: 'SPEECH_STARTED' })
    }

    recognition.onresult = (event: any) => {
      let finalText = ''
      let interimText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i]
        if (r.isFinal) finalText += r[0].transcript + ' '
        else interimText += r[0].transcript
      }
      notify({ type: 'SPEECH_RESULT', finalText: finalText.trim(), interimText: interimText.trim() })
    }

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return // onend restarts/cleans up

      // Fatal error → make sure onend does NOT auto-restart into an endless error loop
      userRequestedStop = true
      isListening = false
      const msgs: Record<string, string> = {
        'not-allowed': 'Microphone blocked. Click the 🔒 icon in the address bar → allow Microphone, then try again.',
        'service-not-allowed': 'Speech service blocked by the browser or site policy.',
        network: 'Speech service needs an internet connection.',
        'audio-capture': 'No microphone found.',
        'language-not-supported': 'This language is not supported for speech recognition.',
      }
      notify({ type: 'SPEECH_ERROR', error: msgs[event.error] || `Speech error: ${event.error}` })
    }

    recognition.onend = () => {
      if (!userRequestedStop) {
        // Chrome ends sessions after silence even with continuous = true → restart quietly
        try {
          recognition.start()
          return
        } catch {
          /* fall through to stopped */
        }
      }
      const wasError = userRequestedStop && !isListening
      isListening = false
      if (!wasError) notify({ type: 'SPEECH_STOPPED' })
    }

    try {
      recognition.start()
    } catch {
      notify({ type: 'SPEECH_ERROR', error: 'Could not start the microphone.' })
    }
  }

  function stopRecognition() {
    userRequestedStop = true
    if (recognition) {
      try {
        recognition.stop()
      } catch {
        /* ignore */
      }
    }
    if (!isListening) notify({ type: 'SPEECH_STOPPED' })
  }

  // ─── Message listener ───────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message?.type) {
      case 'PING':
        sendResponse({ alive: true, listening: isListening })
        break
      case 'START_LISTENING':
        startRecognition(message.lang || 'en-IN')
        sendResponse({ ok: true })
        break
      case 'STOP_LISTENING':
        stopRecognition()
        sendResponse({ ok: true })
        break
      case 'SCAN_FIELDS':
        sendResponse({ fields: scanFormFields() })
        break
      case 'FILL_FIELDS':
        sendResponse({ results: fillAllFields(message.instructions || []) })
        break
      default:
        return false
    }
    return false // every branch above responded synchronously
  })
}
