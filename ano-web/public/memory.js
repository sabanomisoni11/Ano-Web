// build前エラー回避用コメント
/* global chrome */
/* eslint-disable no-unused-vars */

let nowtime;
let intime = new Date(); // ページが開かれた瞬間を最初の見はじめ時間にする;
let Nminute = 3;//n秒以上タブをみていなかった場合にfunctionを実行する
let checked = false;

// 1. ページ読み込み時に即時送信
chrome.runtime.sendMessage({
  type: 'PAGE_VISITED',
  data: {
    currentUrl: window.location.href,
    title: document.title,
    timestamp: new Date().toISOString()
  }
});

function getTime()//タブをみはじめたときとやめたときの時間を取得する関数
{
  if (document.hidden == false)//タブをみはじめた時の時間を取得
  {
    intime = new Date();
  }
  else if (document.hidden == true)//タブをみるのをやめたときの時間を取得
  {
    nowtime = new Date();
  }
}

// ここから下の抽出関数を3つ（selectwords, extractFrequentKeywords, triggerExtraction）書き換えた
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
  // 助詞・助動詞
  'です', 'ます', 'ました', 'でした', 'ている', 'てい',
  'こと', 'もの', 'ため', 'それ', 'これ', 'あれ',
  'ない', 'する', 'なる', 'ある', 'いる', 'れる',
  // 短すぎる語（1文字）は自動除外
]);

function isValidWord(word) {
  if (word.length <= 1) return false;         // 1文字除外
  if (STOP_WORDS.has(word)) return false;     // NGワード除外
  if (/^\d+$/.test(word)) return false;       // 数字のみ除外
  return true;
}

function splitWords(text) {
  // 日本語は形態素解析が本来必要だが、
  // 簡易版：句読点・記号で区切る
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
    referrer: document.referrer || null,   // 1つ前のページURL
    currentUrl: location.href,
    title: document.title,
    description: metaDesc ? metaDesc.content : "", // メタ説明文を追加
    timestamp: new Date().toISOString(),
  };
}

// triggerExtraction を書き換え
function triggerExtraction() {
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
  if (document.hidden === false && checked === false) {//タブをみているときに30秒以上経過していた場合
    const elapsed = (new Date() - intime) / 1000;
    if (elapsed >= Nminute) {
      checked = true;
      triggerExtraction();
    }
  }
}, 1000);

document.addEventListener("visibilitychange", () => //タブ閉じたとき条件が満たされていればfunctionを実行する
{
  getTime();
  if ((nowtime - intime) / 1000 >= Nminute && document.hidden === true && checked === false)//30秒以上タブをみていなかった場合
  {
    checked = true;
    triggerExtraction();
  }
});

// URLが変わるたびに「新しいページ訪問」として再カウントを開始する
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    checked = false; // 再度解析できるようにリセット
    intime = new Date(); // タイマーリセット
    // 新しいURLを送信
    chrome.runtime.sendMessage({
      type: 'PAGE_VISITED',
      data: {
        currentUrl: location.href,
        title: document.title,
        timestamp: new Date().toISOString()
      }
    });
  }
}).observe(document.querySelector("title"), { subtree: true, characterData: true, childList: true });