// listen.ts — speech recognition runs in an EXTENSION page, not in the website.
// Microphone permission is then granted once for the extension itself and works
// on every site (a content script would need the permission per website, and
// fails on sites that block the microphone).

const $ = (id: string) => document.getElementById(id)!
const params = new URLSearchParams(location.search)
const lang = params.get('lang') || 'en-IN'

const w = window as any
const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition

let recognition: any = null
let stopped = false
let finalText = ''

const send = (msg: object) => chrome.runtime.sendMessage(msg, () => void chrome.runtime.lastError)
const setStatus = (t: string, on = false) => {
  $('status').textContent = t
  $('dot').classList.toggle('on', on)
}
const showError = (t: string) => { $('err').textContent = t }

function finish(notify = true) {
  stopped = true
  try { recognition?.stop() } catch { /* ignore */ }
  if (notify) send({ type: 'SPEECH_STOPPED' })
}

async function ensureMicPermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach(t => t.stop())
    return true
  } catch (e: any) {
    const name = e?.name || ''
    if (name === 'NotFoundError') showError('No microphone found. Plug one in and try again.')
    else showError(
      'Microphone is blocked for this extension. Click the 🔒/camera icon in this window\'s address bar (or open chrome://settings/content/microphone), allow the extension, then press Start again.'
    )
    return false
  }
}

function start() {
  recognition = new Ctor()
  recognition.lang = lang
  recognition.continuous = true
  recognition.interimResults = true

  recognition.onstart = () => { setStatus('Listening… speak now', true); send({ type: 'SPEECH_STARTED' }) }

  recognition.onresult = (event: any) => {
    let fin = '', interim = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i]
      if (r.isFinal) fin += r[0].transcript + ' '
      else interim += r[0].transcript
    }
    if (fin) { finalText += fin; $('final').textContent = finalText }
    $('interim').textContent = interim
    send({ type: 'SPEECH_RESULT', finalText: fin.trim(), interimText: interim.trim() })
  }

  recognition.onerror = (e: any) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return
    stopped = true
    const msgs: Record<string, string> = {
      'not-allowed': 'Microphone permission denied for the extension.',
      'service-not-allowed': 'Speech service is blocked by the browser.',
      network: 'Speech recognition needs an internet connection (Chrome sends audio to Google).',
      'audio-capture': 'No microphone found.',
      'language-not-supported': 'This language is not supported for speech recognition.',
    }
    const m = msgs[e.error] || `Speech error: ${e.error}`
    showError(m); setStatus('Stopped', false)
    send({ type: 'SPEECH_ERROR', error: m })
  }

  recognition.onend = () => {
    if (!stopped) { try { recognition.start(); return } catch { /* fall through */ } }
    setStatus('Stopped', false)
  }

  try { recognition.start() } catch { showError('Could not start speech recognition.') }
}

async function init() {
  if (!Ctor) {
    const m = 'Speech recognition is not supported in this browser. Please use Google Chrome.'
    showError(m); send({ type: 'SPEECH_ERROR', error: m }); return
  }
  if (!(await ensureMicPermission())) {
    send({ type: 'SPEECH_ERROR', error: 'Microphone permission needed — see the small "Voice Form Assistant" window.' })
    return
  }
  start()
}

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (msg?.type === 'LISTEN_PING') { sendResponse({ listening: !stopped }); return false }
  if (msg?.type === 'STOP_LISTEN_WINDOW') { finish(true); window.close(); return false }
  return false
})

$('stop').addEventListener('click', () => { finish(true); window.close() })
window.addEventListener('beforeunload', () => { if (!stopped) finish(true) })

init()
