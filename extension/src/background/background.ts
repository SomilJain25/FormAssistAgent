// background.ts — MV3 service worker.
// Receives speech events from the content script and keeps them in
// chrome.storage so the popup can be closed and re-opened without losing data.

import { patchSpeech, readSpeech } from '../services/speechStore'

chrome.runtime.onInstalled.addListener(() => {
  console.log('Voice Form Assistant installed.')
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message?.type) {
    case 'PING':
      sendResponse({ status: 'ok', version: chrome.runtime.getManifest().version })
      return false

    case 'SPEECH_STARTED':
      patchSpeech({ status: 'listening', error: null })
      break

    case 'SPEECH_RESULT':
      readSpeech().then(state => {
        const transcript = message.finalText
          ? `${state.transcript} ${message.finalText}`.trim()
          : state.transcript
        return patchSpeech({ transcript, interim: message.interimText || '' })
      })
      break

    case 'SPEECH_STOPPED':
      patchSpeech({ status: 'idle', interim: '' })
      break

    case 'SPEECH_ERROR':
      patchSpeech({ status: 'error', interim: '', error: message.error || 'Speech error' })
      break
  }
  // No async response is ever sent → return false so Chrome doesn't warn
  // "message port closed before a response was received".
  return false
})
