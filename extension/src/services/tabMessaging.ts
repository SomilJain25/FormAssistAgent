// tabMessaging.ts — talk to the content script of the active tab.
// Injects the content script automatically if the page was opened before the
// extension was installed/reloaded, and returns a Promise instead of callbacks.

export class TabError extends Error {}

function getActiveTab(): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      const url = tab?.url || ''
      if (!tab?.id || !/^https?:\/\//.test(url)) {
        reject(new TabError('Please open a regular web page (http/https) with a form first.'))
      } else {
        resolve(tab)
      }
    })
  })
}

function send(tabId: number, payload: object): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, payload, (res) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else resolve(res)
    })
  })
}

function inject(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript({ target: { tabId }, files: ['contentScript.js'] }, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else resolve()
    })
  })
}

export async function sendToActiveTab<T = any>(type: string, extra: object = {}): Promise<T> {
  const tab = await getActiveTab()
  const tabId = tab.id!
  try {
    return await send(tabId, { type, ...extra })
  } catch {
    try {
      await inject(tabId)
      await new Promise(r => setTimeout(r, 250))
      return await send(tabId, { type, ...extra })
    } catch {
      throw new TabError(
        'Could not connect to this page. Refresh the page and try again (extensions cannot run on chrome:// or the Web Store pages).'
      )
    }
  }
}
