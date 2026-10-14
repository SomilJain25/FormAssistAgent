// speechStore.ts — speech state lives in chrome.storage so it survives the
// popup closing (Chrome closes the popup whenever the user clicks the page).

export type SpeechStatus = 'idle' | 'listening' | 'error'

export interface SpeechState {
  status: SpeechStatus
  transcript: string
  interim: string
  error: string | null
}

export const SPEECH_KEY = 'vfa_speech_state'

export const EMPTY_SPEECH: SpeechState = { status: 'idle', transcript: '', interim: '', error: null }

export function readSpeech(): Promise<SpeechState> {
  return new Promise(resolve => {
    chrome.storage.local.get(SPEECH_KEY, res => {
      resolve({ ...EMPTY_SPEECH, ...(res[SPEECH_KEY] || {}) })
    })
  })
}

export async function patchSpeech(patch: Partial<SpeechState>): Promise<void> {
  const current = await readSpeech()
  return new Promise(resolve => {
    chrome.storage.local.set({ [SPEECH_KEY]: { ...current, ...patch } }, resolve)
  })
}
