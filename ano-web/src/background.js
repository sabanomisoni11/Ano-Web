// build前エラー回避用コメント
/* global chrome */
/* eslint-disable no-unused-vars */

import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;

let extractorPipeline = null;

async function loadModel() {
  if (!extractorPipeline) {
    console.log("AIモデルを読み込み中...");
    extractorPipeline = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small');
    console.log("✅ AIモデルの準備完了！");
  }
  return extractorPipeline;
}

async function textToVector(text) {
  const extractor = await loadModel();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// ==========================================
// IndexedDBの構築（バージョン5）
// ==========================================
const DB_NAME = "AnoWebDB";
const STORE_NAME = "history_vectors";
const DB_VERSION = 5;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "currentUrl" });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

async function saveToDB(data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(data);

    request.onsuccess = () => {
      console.log("IndexedDBに保存しました！", data.title);
      resolve();
    };
    request.onerror = (event) => reject(event.target.error);
  });
}

// ===============================================
// memory.js から送られてきたデータを受け取るリスナー
// ===============================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === 'PAGE_VISITED') {
    const { currentUrl, title, timestamp } = message.data;
    saveToDB({
      currentUrl,
      title,
      timestamp,
      description: "",
      keywords: [],
      headings: [],
      bolds: [],
      wordCounts: {},
      vector: null
    });
    return;
  }

  if (message.type === 'KEYWORDS_EXTRACTED') {
    const pageData = message.data;

    // 安全対策：keywordsが配列であることを保証し、なければ空配列として扱う
    const keywordsArray = Array.isArray(pageData.keywords) ? pageData.keywords : [];

    // 連結処理を安全に実行
    const combinedText = `passage: タイトル: ${pageData.title || ""} 概要: ${pageData.description || ""} 重要キーワード: ${keywordsArray.join(', ')}`.trim();

    textToVector(combinedText).then(async (vector) => {
      const updateData = {
        currentUrl: pageData.currentUrl,
        title: pageData.title,
        description: pageData.description || "",
        keywords: keywordsArray,
        headings: pageData.headings || [],
        bolds: pageData.bolds || [],
        wordCounts: pageData.wordCounts || {},
        timestamp: pageData.timestamp,
        vector: vector
      };
      await saveToDB(updateData);
    });
    return true;
  }

  if (message.type === 'VECTORIZE_QUERY') {
    textToVector(message.text)
      .then(vector => {
        sendResponse({ vector: vector });
      })
      .catch(err => {
        console.error("ベクトル化エラー:", err);
        sendResponse({ vector: null });
      });
    return true;
  }
});

// UIを開くための処理
function openSearchPage() {
  chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
}

chrome.action.onClicked.addListener(openSearchPage);
chrome.commands.onCommand.addListener((command) => {
  if (command === "open-search-page") openSearchPage();
});