import { useState, useEffect } from 'react';
import { Search, Clock, MonitorSmartphone, Trash2, MoreVertical, Menu } from 'lucide-react';

// ==========================================
// ハイブリッド検索のスコア調整設定
// ==========================================
const SCORE_SETTINGS = {
  TITLE_MATCH: 0.08,       // タイトルに検索ワードが含まれる場合のボーナス
  DESC_MATCH: 0.02,        // 概要(description)に含まれる場合のボーナス
  HEADING_MATCH: 0.05,     // 見出し(h1~h4)に含まれる場合のボーナス
  BOLD_MATCH: 0.03,        // 太字(strong, b)に含まれる場合のボーナス
  WORD_COUNT_UNIT: 0.01,   // 本文に1回出現するごとのボーナス
  WORD_COUNT_MAX: 0.15,    // 本文出現ボーナスの最大値（上がりすぎ防止）
  CUTOFF_THRESHOLD: 0.8   // これ以下のスコアは「関連なし」として非表示にする
};

// ==========================================
// 🗄️ IndexedDB関連の関数 (バージョン4に更新)
// ==========================================
function getAllHistoryFromDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("AnoWebDB", 4); // バージョン4
    
    // ★検索画面から先に開かれた場合でも、箱を作るようする
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("history_vectors")) {
        db.createObjectStore("history_vectors", { keyPath: "currentUrl" });
      }
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("history_vectors")) {
        resolve([]); 
        return;
      }
      const transaction = db.transaction(["history_vectors"], "readonly");
      const store = transaction.objectStore("history_vectors");
      const getAllRequest = store.getAll();
      getAllRequest.onsuccess = () => {
        resolve(getAllRequest.result || []);
      };
      getAllRequest.onerror = () => reject(getAllRequest.error);
    };
    request.onerror = () => reject(request.error);
  });
}

function deleteHistoryFromDB(id) {
  return new Promise((resolve) => {
    const request = indexedDB.open("AnoWebDB", 4);
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(["history_vectors"], "readwrite");
      const store = transaction.objectStore("history_vectors");
      store.delete(id);
      transaction.oncomplete = () => resolve();
    };
  });
}

// ==========================================
// コサイン類似度計算
// ==========================================
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let mA = 0;
  let mB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    mA += vecA[i] * vecA[i];
    mB += vecB[i] * vecB[i];
  }
  return mA === 0 || mB === 0 ? 0 : dotProduct / (Math.sqrt(mA) * Math.sqrt(mB));
}

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [historyItems, setHistoryItems] = useState([]);
  const [allHistory, setAllHistory] = useState([]);

  // 1. 初回起動時にIndexedDBからデータを読み込む
  useEffect(() => {
    getAllHistoryFromDB().then(data => {
      const sorted = [...data].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      const formatted = sorted.map(item => {
        const date = new Date(item.timestamp);
        let domain = item.currentUrl;
        try { domain = new URL(item.currentUrl).hostname; } catch (err) {}

        return {
          id: item.currentUrl, 
          time: `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`,
          title: item.title || "No Title",
          url: domain,
          icon: item.title ? item.title.charAt(0).toUpperCase() : 'W',
          originalUrl: item.currentUrl,
          vector: item.vector,
          description: item.description || "",
          headings: item.headings || [],       
          bolds: item.bolds || [],             
          wordCounts: item.wordCounts || {}    
        };
      });
      
      setHistoryItems(formatted);
      setAllHistory(formatted);
    });
  }, []);

  // 2. ハイブリッドAI検索処理
  useEffect(() => {
    const performSearch = async () => {
      const query = searchQuery.trim();
      if (!query) {
        setHistoryItems(allHistory);
        return;
      }

      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(
          { type: 'VECTORIZE_QUERY', text: `query: ${query}` },
          (response) => {
            if (response && response.vector) {
              const queryVector = response.vector;
              const lowerQuery = query.toLowerCase();
              
              const scoredItems = allHistory.map(item => {
                if (!item.vector) return { ...item, score: 0 };
                
                // ① AIベーススコア (コサイン類似度)
                let finalScore = cosineSimilarity(queryVector, item.vector);

                // ② 【ハイブリッド独自加点アルゴリズム】 (上部の設定値を使用)
                
                // タイトル
                if (item.title && item.title.toLowerCase().includes(lowerQuery)) {
                  finalScore += SCORE_SETTINGS.TITLE_MATCH; 
                }

                // メタ概要(description)
                if (item.description && item.description.toLowerCase().includes(lowerQuery)) {
                  finalScore += SCORE_SETTINGS.DESC_MATCH;
                }

                // 見出し(h1~h4)
                if (item.headings && item.headings.some(h => h.toLowerCase().includes(lowerQuery))) {
                  finalScore += SCORE_SETTINGS.HEADING_MATCH;
                }

                // 太字要素(strong, b, em)
                if (item.bolds && item.bolds.some(b => b.toLowerCase().includes(lowerQuery))) {
                  finalScore += SCORE_SETTINGS.BOLD_MATCH;
                }

                // 出現頻度
                if (item.wordCounts) {
                  let matchCount = 0;
                  Object.entries(item.wordCounts).forEach(([word, count]) => {
                    if (word.toLowerCase().includes(lowerQuery)) {
                      matchCount += count;
                    }
                  });
                  if (matchCount > 0) {
                    finalScore += Math.min(SCORE_SETTINGS.WORD_COUNT_MAX, matchCount * SCORE_SETTINGS.WORD_COUNT_UNIT);
                  }
                }

                return { ...item, score: finalScore };
              });

              // 関係ないデータを弾く足切りライン
              const filteredItems = scoredItems.filter(item => item.score >= SCORE_SETTINGS.CUTOFF_THRESHOLD);

              // 最終スコアが高い順にソート
              filteredItems.sort((a, b) => b.score - a.score);
              setHistoryItems(filteredItems);
            } else {
              fallbackSearch(query);
            }
          }
        );
      } else {
        fallbackSearch(query);
      }
    };

    const fallbackSearch = (query) => {
      const lowerQuery = query.toLowerCase();
      const filtered = allHistory.filter(item => 
        item.title.toLowerCase().includes(lowerQuery) ||
        item.url.toLowerCase().includes(lowerQuery)
      );
      setHistoryItems(filtered);
    };

    const timeoutId = setTimeout(() => {
      performSearch();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, allHistory]);


  const toggleSelection = (id) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) newSelection.delete(id);
    else newSelection.add(id);
    setSelectedIds(newSelection);
  };

  const handleDeleteSelected = async () => {
    for (const id of selectedIds) {
      await deleteHistoryFromDB(id);
    }
    setHistoryItems(historyItems.filter(item => !selectedIds.has(item.id)));
    setAllHistory(allHistory.filter(item => !selectedIds.has(item.id)));
    setSelectedIds(new Set());
  };

  return (
    <div className="flex h-screen w-full bg-[#18181A] text-[#E8EAED] font-sans overflow-hidden">
      
      {/* サイドバー */}
      <aside className={`flex flex-col bg-[#1E1E20] transition-all duration-300 border-r border-[#2C2C2E] ${isSidebarOpen ? 'w-64' : 'w-0 overflow-hidden border-none'}`}>
        <div className="h-16 flex items-center px-6 shrink-0">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => setIsSidebarOpen(false)}>
             <img src="https://www.gstatic.com/images/branding/product/1x/chrome_48dp.png" alt="Chrome" className="w-6 h-6 grayscale opacity-80" />
            <span className="text-xl font-medium tracking-wide text-[#8AB4F8]">Ano-Web</span>
          </div>
        </div>

        <nav className="flex-1 py-4">
          <ul className="space-y-1">
            <li>
              <button className="w-full flex items-center gap-5 px-6 py-3 bg-[#8AB4F8]/10 text-[#8AB4F8] rounded-r-full font-medium">
                <Clock size={20} />
                Chrome 履歴
              </button>
            </li>
            <li>
              <button className="w-full flex items-center gap-5 px-6 py-3 text-[#9AA0A6] hover:bg-[#2C2C2E] rounded-r-full transition-colors group">
                <MonitorSmartphone size={20} />
                選択項目を削除
              </button>
            </li>
          </ul>
        </nav>
      </aside>

      {/* メインコンテンツエリア */}
      <main className="flex-1 flex flex-col h-full min-w-0 bg-[#18181A]">
        
        {/* 上部ヘッダー */}
        <header className="h-20 flex items-center px-8 gap-4 border-b border-[#2C2C2E] bg-[#18181A] shrink-0 sticky top-0 z-10">
          {!isSidebarOpen && (
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-[#2C2C2E] rounded-full transition-colors text-[#9AA0A6]">
              <Menu size={20} />
            </button>
          )}

          {/* 検索コンテナ */}
          <div className="flex-1 max-w-[800px] relative">
            <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-[#9AA0A6]">
              <Search size={20} />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="調べたい言葉をふわっと入力 （AI検索対応）"
              className="w-full h-12 pl-14 pr-4 bg-[#202022] border border-[#3C3C3E] rounded-full text-[#E8EAED] placeholder-[#71717A] focus:outline-none focus:border-[#8AB4F8] focus:bg-[#202022] transition-colors"
            />
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-4 ml-auto animate-in fade-in duration-200">
              <span className="text-[#8AB4F8] text-sm font-medium">
                {selectedIds.size} 件を選択中
              </span>
              <button onClick={handleDeleteSelected} className="px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-md text-sm font-medium transition-colors flex items-center gap-2">
                <Trash2 size={16} /> 削除
              </button>
            </div>
          )}
        </header>

        {/* 履歴リストエリア */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-[1000px] mx-auto bg-[#242426] border border-[#333336] rounded-2xl shadow-xl overflow-hidden py-2">
            
            {historyItems.length === 0 ? (
              <div className="text-center text-[#71717A] py-20">
                <p>保存された履歴がまだありません。</p>
                <p className="text-sm mt-2">適当なページにアクセスすると履歴として表示されます。</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {historyItems.map((item) => {
                  const isSelected = selectedIds.has(item.id);
                  return (
                    <div 
                      key={item.id} 
                      className={`flex items-center group px-6 py-3 hover:bg-[#2C2C2E] transition-colors cursor-pointer border-b border-[#333336]/50 last:border-none ${isSelected ? 'bg-[#2C2C2E]' : ''}`}
                      onClick={() => toggleSelection(item.id)}
                    >
                      <div className="w-12 flex justify-start shrink-0">
                        <input type="checkbox" checked={isSelected} onChange={() => {}} className="w-4 h-4 cursor-pointer accent-[#8AB4F8] bg-[#202124] border-[#9AA0A6] rounded" onClick={(e) => e.stopPropagation()} />
                      </div>

                      <div className="w-20 text-[#9AA0A6] text-[15px] shrink-0 font-medium">{item.time}</div>

                      <div className="w-8 h-8 rounded bg-[#3A3A3C] flex items-center justify-center text-xs font-bold text-[#D4D4D8] shrink-0 mr-4">
                        {item.icon}
                      </div>

                      <div className="flex flex-1 items-baseline gap-4 min-w-0 pr-4">
                        <span className="text-[15px] text-[#F4F4F5] truncate font-medium">{item.title}</span>
                        <span className="text-[13px] text-[#71717A] truncate">{item.url}</span>
                      </div>

                      {/* ★調整されたハイブリッドスコアの％表示 */}
                      {item.score !== undefined && item.score > 0 && searchQuery.trim() !== '' && (
                        <div className="mr-4 px-3 py-1 bg-[#22d3ee]/10 text-[#22d3ee] text-xs font-bold rounded-full whitespace-nowrap">
                          {Math.min(100, Math.round(item.score * 100))}% Match
                        </div>
                      )}

                      <button className="w-8 h-8 rounded-full flex items-center justify-center text-[#71717A] opacity-0 group-hover:opacity-100 hover:bg-[#3C3C3E] transition-all">
                        <MoreVertical size={18} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}