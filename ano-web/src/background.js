// build前エラー回避用コメント
/* global chrome */
/* eslint-disable no-unused-vars */

import { pipeline, env } from '@xenova/transformers';

// ==========================================
// 🚨 Transformers.js用のおまじない（Service Worker制限回避）
// ==========================================
// 拡張機能の中からはローカルモデルを読み込めない仕様のため、Webから取得するように設定
env.allowLocalModels = false;
// Chromeの厳しいスレッド制限によるクラッシュを防ぐため、AIの計算をシングルスレッドに制限
env.backends.onnx.wasm.numThreads = 1;

// AIモデルの準備（日本語対応の軽量・高性能モデル）
let extractorPipeline = null;

// モデルをロードする関数（初回だけ少し時間がかかります）
async function loadModel() {
  if (!extractorPipeline) {
    console.log("AIモデルを読み込み中...");
    // 多言語対応の埋め込みモデルを使用
    extractorPipeline = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small');
    console.log("✅ AIモデルの準備完了！");
  }
  return extractorPipeline;
}

// 文字列をベクトル（数字の配列）に変換する関数
async function textToVector(text) {
  const extractor = await loadModel();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// memory.js から送られてきたデータを受け取るリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'KEYWORDS_EXTRACTED') {
    const pageData = message.data;

    // ローカル保存処理
    chrome.storage.local.set({ extractedData: pageData });

    console.log("📩 memory.js からデータを受信しました！", pageData.title);

    // タイトル、説明文、キーワードを結合し、「1つの意味を持つ文章」にする
    const combinedText = `
            タイトル: ${pageData.title}
            概要: ${pageData.description}
            重要キーワード: ${pageData.keywords.join(', ')}
        `.trim();

    console.log("これからAIに食わせる文章:\n", combinedText);

    // AIでベクトル化を実行
    textToVector(combinedText).then((vector) => {
      console.log("ベクトル化成功！(長さ):", vector.length);

      // TODO: IndexedDBの本格的な構築までは、一旦 storage に保存したデータを使います
    });

    return true;
  }
});

// ==========================================
// UIを開くためのショートカット＆アイコンクリック処理
// ==========================================

// 共通の「検索ページを開く」関数
function openSearchPage() {
  chrome.tabs.create({
    url: chrome.runtime.getURL("index.html")
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