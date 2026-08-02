// build前エラー回避用コメント
/* global chrome */
/* eslint-disable no-unused-vars */

let nowtime;
let intime = new Date(); // ページが開かれた瞬間を最初の見はじめ時間にする
let Nminute = 3; // 3秒以上タブを見ていた場合にfunctionを実行する
let checked = false;

// 1. ページ読み込み時に即時送信（PDFや画像でもURLとタイトルはここで保存される）
chrome.runtime.sendMessage({
  type: 'PAGE_VISITED',
  data: {
    currentUrl: window.location.href,
    title: document.title || "No Title",
    timestamp: new Date().toISOString()
  }
});

function getTime() {
  if (document.hidden === false) {
    intime = new Date();
  }
  else if (document.hidden === true) {
    nowtime = new Date();
  }
}

function extractCategorizedWords() {
  // ① 見出し（h1〜h4）の抽出
  const headings = new Set();
  document.querySelectorAll('h1, h2, h3, h4').forEach(el => {
    splitWords(el.innerText).forEach(w => headings.add(w));
  });

  // ② 太字（strong, b, em）の抽出
  const bolds = new Set();
  document.querySelectorAll('strong, b, em').forEach(el => {
    splitWords(el.innerText).forEach(w => bolds.add(w));
  });

  // ③ ページ全体の単語出現頻度（トップ50）
  const allText = document.body.innerText;
  const freq = {};
  splitWords(allText).forEach(word => {
    freq[word] = (freq[word] || 0) + 1;
  });
  const sortedFreq = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 50);
  const wordCounts = Object.fromEntries(sortedFreq);

  return { headings: [...headings], bolds: [...bolds], wordCounts };
}

const STOP_WORDS = new Set([
  'です', 'ます', 'ました', 'でした', 'ている', 'てい',
  'こと', 'もの', 'ため', 'それ', 'これ', 'あれ',
  'ない', 'する', 'なる', 'ある', 'いる', 'れる',
]);

function isValidWord(word) {
  if (word.length <= 1) return false;
  if (STOP_WORDS.has(word)) return false;
  if (/^\d+$/.test(word)) return false;
  if (/\d+\/\d+[（(].+[)）]/.test(word)) return false;
  if (/\d+\/\d+/.test(word)) return false;
  if (/^\d+年\d+月\d+日$/.test(word)) return false;
  if (/^\d+月\d+日$/.test(word)) return false;
  return true;
}

function splitWords(text) {
  const segmenter = new Intl.Segmenter('ja', { granularity: 'word' });
  const words = [];
  for (const segment of segmenter.segment(text)) {
    if (segment.isWordLike && isValidWord(segment.segment)) {
      words.push(segment.segment);
    }
  }
  return words;
}

function getReferrer() {
  const metaDesc = document.querySelector('meta[name="description"]');
  return {
    referrer: document.referrer || null,
    currentUrl: location.href,
    title: document.title || "No Title",
    description: metaDesc ? metaDesc.content : "",
    timestamp: new Date().toISOString(),
  };
}

// triggerExtraction の書き換え（ホワイトリスト方式フィルター）
function triggerExtraction() {
  // ★ 最強のフィルター：普通のWebページ（HTML）以外はすべてここでストップ！
  if (!document.contentType || !document.contentType.includes('text/html')) {
    console.log(`Webページではない形式（${document.contentType}）のため、キーワード抽出をスキップします`);
    return;
  }

  const { headings, bolds, wordCounts } = extractCategorizedWords();

  chrome.runtime.sendMessage({
    type: 'KEYWORDS_EXTRACTED',
    data: {
      ...getReferrer(),
      headings,
      bolds,
      wordCounts
    }
  });
}

setInterval(() => {
  if (document.hidden === false && checked === false) {
    const elapsed = (new Date() - intime) / 1000;
    if (elapsed >= Nminute) {
      checked = true;
      triggerExtraction();
    }
  }
}, 1000);

document.addEventListener("visibilitychange", () => {
  getTime();
  if ((nowtime - intime) / 1000 >= Nminute && document.hidden === true && checked === false) {
    checked = true;
    triggerExtraction();
  }
});

// URLが変わるたびに「新しいページ訪問」として再カウントを開始する処理
let lastUrl = location.href;
// <title> がないページ（PDFなど）でもエラーにならないよう、存在するノードを監視対象にする
const targetNode = document.querySelector("title") || document.documentElement;

new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    checked = false;
    intime = new Date();

    chrome.runtime.sendMessage({
      type: 'PAGE_VISITED',
      data: {
        currentUrl: location.href,
        title: document.title || "No Title",
        timestamp: new Date().toISOString()
      }
    });
  }
}).observe(targetNode, { subtree: true, characterData: true, childList: true });