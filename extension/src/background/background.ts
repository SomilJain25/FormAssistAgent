// background.ts — Chrome Extension Service Worker (Manifest V3)
// This file runs in the background and handles messaging between
// the popup and content scripts.

chrome.runtime.onInstalled.addListener(() => {
  console.log('Voice Form Assistant installed successfully.')
})

// Listen for messages from the popup (to be expanded in later phases)
chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({ status: 'ok', version: '1.0.0' })
    }
    return true // keeps the message channel open for async responses
  }
)