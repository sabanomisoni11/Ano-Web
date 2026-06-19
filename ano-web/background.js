chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'KEYWORDS_EXTRACTED') {
    chrome.storage.local.set({ extractedData: message.data });
  }
});