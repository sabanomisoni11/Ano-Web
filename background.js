// 共通の「検索ページを開く」関数
function openSearchPage() {
  chrome.tabs.create({
    url: chrome.runtime.getURL("search.html")
  });
}

// 1. 拡張機能のアイコンがクリックされたとき
chrome.action.onClicked.addListener(() => {
  openSearchPage();
});

// 2. ショートカットキー（Ctrl+Shift+H）が押されたとき
chrome.commands.onCommand.addListener((command) => {
  if (command === "open-search-page") {
    openSearchPage();
  }
});