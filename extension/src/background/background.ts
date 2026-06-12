// background.ts - Chrome Extension Service Worker
// This file runs in the background and handles messaging
// between popup and content scripts.

chrome.runtime.onInstalled.addListener(() => {
  console.log('Voice Form Assistant installed successfully.')
})

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({
        status: 'ok',
        version: '1.0.0',
      })
    }

    return true
  }
)