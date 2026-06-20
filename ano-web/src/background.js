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

// ==========================================
// IndexedDBの構築（AIの記憶の保存場所）
// ==========================================
const DB_NAME = "AnoWebDB";
const STORE_NAME = "history_vectors";
const DB_VERSION = 2; // エラー回避のためバージョン2に設定

// DBを開く（なければ作る）関数
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      // 'currentUrl' (URL) をキーにしてデータを保存する箱を作成
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "currentUrl" });
        console.log("🗄️ IndexedDBの箱（ストア）を新規作成しました！");
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// データを保存する関数
async function saveToDB(data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    // 読み書き可能なトランザクションを開始
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    // データを保存（すでに同じURLの履歴があれば上書きで最新化）
    const request = store.put(data);

    request.onsuccess = () => {
      console.log("IndexedDBにAIの記憶（ベクトルデータ）を保存しました！", data.title);
      resolve();
    };
    request.onerror = (event) => {
      console.error("❌ 保存エラー:", event.target.error);
      reject(event.target.error);
    };
  });
}

// ===============================================
// memory.js から送られてきたデータを受け取るリスナー
// ===============================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ① ページ読み込み時に即時保存する処理
  if (message.type === 'PAGE_VISITED') {
    const { currentUrl, title, timestamp } = message.data;
    saveToDB({
      currentUrl,
      title,
      timestamp,
      description: "", // 解析前は空
      keywords: [],    // 解析前は空
      vector: null     // 解析前はなし
    });
    return;
  }

  // ② 30秒後にキーワード抽出データを受け取って更新する処理
  if (message.type === 'KEYWORDS_EXTRACTED') {
    const pageData = message.data;

    const combinedText = `
        タイトル: ${pageData.title}
        概要: ${pageData.description}
        重要キーワード: ${pageData.keywords.join(', ')}
    `.trim();

    // ★修正：保存する文章の先頭に「passage: 」をつける
    textToVector(`passage: ${combinedText}`).then(async (vector) => {
      const updateData = {
        currentUrl: pageData.currentUrl,
        title: pageData.title,
        description: pageData.description,
        keywords: pageData.keywords,
        timestamp: pageData.timestamp,
        vector: vector
      };
      await saveToDB(updateData);
    });
    return true;
  }

  // ③ 検索クエリをベクトル化して返す処理
  if (message.type === 'VECTORIZE_QUERY') {
    // ★修正：検索ワードの先頭に「query: 」をつける
    textToVector(`query: ${message.text}`)
      .then(vector => {
        sendResponse({ vector: vector });
      })
      .catch(err => {
        console.error("ベクトル化エラー:", err);
        sendResponse({ vector: null });
      });
    return true; // 非同期でsendResponseを呼ぶために必須
  }
});

// ==========================================
// UIを開くためのショートカット＆アイコンクリック処理（トップレベルに配置！）
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