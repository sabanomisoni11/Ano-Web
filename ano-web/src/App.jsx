import { useState, useEffect } from 'react';
import { Search, Clock, MonitorSmartphone, Trash2, MoreVertical, Menu } from 'lucide-react';

// ==========================================
// 🗄️ IndexedDB関連の関数
// ==========================================
function getAllHistoryFromDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("AnoWebDB", 2); // ★バージョンを2に変更

    // ★App.jsx側でも、もし箱がなければ作るように追加（エラー防止）
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
      getAllRequest.onsuccess = () => resolve(getAllRequest.result);
      getAllRequest.onerror = () => reject(getAllRequest.error);
    };
    request.onerror = () => reject(request.error);
  });
}

function deleteHistoryFromDB(id) {
  return new Promise((resolve) => {
    const request = indexedDB.open("AnoWebDB", 2); // ★バージョンを2に変更
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
// 🧠 AI検索のための数学計算（コサイン類似度）
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

  // 表示用のリストと、全データを保持するリストの2つを用意する
  const [historyItems, setHistoryItems] = useState([]);
  const [allHistory, setAllHistory] = useState([]);

  // 1. 初回起動時にIndexedDBから本物のデータを読み込む
  useEffect(() => {
    getAllHistoryFromDB().then(data => {
      console.log("📚 DBから本物の履歴を読み込みました:", data.length, "件");
      
      const sorted = [...data].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      const formatted = sorted.map(item => {
        const date = new Date(item.timestamp);
        let domain = item.currentUrl;
        try { 
          domain = new URL(item.currentUrl).hostname; 
        } catch (err) {}

        return {
          id: item.currentUrl, 
          time: `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`,
          title: item.title || "No Title",
          url: domain,
          icon: item.title ? item.title.charAt(0).toUpperCase() : 'W',
          originalUrl: item.currentUrl,
          vector: item.vector // ★ AIの記憶データも保持しておく
        };
      });
      
      setHistoryItems(formatted);
      setAllHistory(formatted); // 全件データとしてバックアップ
    });
  }, []);

  // 2. ★ AI検索処理（検索ワードが変わるたびに自動で実行）
  useEffect(() => {
    const performSearch = async () => {
      const query = searchQuery.trim();
      if (!query) {
        // 検索枠が空なら元のリストに戻す
        setHistoryItems(allHistory);
        return;
      }

      // Chromeの通信機能が使える環境かチェック
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        // background.js に「この言葉をベクトル化して！」とお願いする
        chrome.runtime.sendMessage(
          { type: 'VECTORIZE_QUERY', text: query },
          (response) => {
            if (response && response.vector) {
              const queryVector = response.vector;
              
              // 全ての履歴と「意味の近さ」を計算する
              const scoredItems = allHistory.map(item => {
                // まだ解析されていない（ベクトルがない）場合はスコア0
                if (!item.vector) return { ...item, score: 0 };
                
                const score = cosineSimilarity(queryVector, item.vector);
                return { ...item, score };
              });

              // スコアが高い順（意味が近い順）に並び替え
              scoredItems.sort((a, b) => b.score - a.score);
              setHistoryItems(scoredItems);
            } else {
              fallbackSearch(query); // ベクトル化失敗時は普通のキーワード検索
            }
          }
        );
      } else {
        fallbackSearch(query); // Chrome環境外のテスト用
      }
    };

    // 普通の文字一致検索（保険）
    const fallbackSearch = (query) => {
      const lowerQuery = query.toLowerCase();
      const filtered = allHistory.filter(item => 
        item.title.toLowerCase().includes(lowerQuery) ||
        item.url.toLowerCase().includes(lowerQuery)
      );
      setHistoryItems(filtered);
    };

    // 入力して0.5秒手が止まったら検索を実行（重い計算を防ぐデバウンス処理）
    const timeoutId = setTimeout(() => {
      performSearch();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, allHistory]);


  const toggleSelection = (id) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const handleDeleteSelected = async () => {
    for (const id of selectedIds) {
      await deleteHistoryFromDB(id);
    }
    setHistoryItems(historyItems.filter(item => !selectedIds.has(item.id)));
    setAllHistory(allHistory.filter(item => !selectedIds.has(item.id))); // バックアップからも消す
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
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-[#2C2C2E] rounded-full transition-colors text-[#9AA0A6]"
            >
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
              <button 
                onClick={handleDeleteSelected}
                className="px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Trash2 size={16} />
                削除
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
                <p className="text-sm mt-2">適当なページを開いて30秒待つと、ここに保存されます。</p>
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
                      {/* チェックボックス */}
                      <div className="w-12 flex justify-start shrink-0">
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          onChange={() => {}} 
                          className="w-4 h-4 cursor-pointer accent-[#8AB4F8] bg-[#202124] border-[#9AA0A6] rounded"
                          onClick={(e) => e.stopPropagation()} 
                        />
                      </div>

                      {/* 時間 */}
                      <div className="w-20 text-[#9AA0A6] text-[15px] shrink-0 font-medium">
                        {item.time}
                      </div>

                      {/* アイコン */}
                      <div className="w-8 h-8 rounded bg-[#3A3A3C] flex items-center justify-center text-xs font-bold text-[#D4D4D8] shrink-0 mr-4">
                        {item.icon}
                      </div>

                      {/* タイトルとURL */}
                      <div className="flex flex-1 items-baseline gap-4 min-w-0 pr-4">
                        <span className="text-[15px] text-[#F4F4F5] truncate font-medium">
                          {item.title}
                        </span>
                        <span className="text-[13px] text-[#71717A] truncate">
                          {item.url}
                        </span>
                      </div>

                      {/* ★AI類似度スコア（検索時のみ表示） */}
                      {item.score !== undefined && item.score > 0 && searchQuery.trim() !== '' && (
                        <div className="mr-4 px-3 py-1 bg-[#22d3ee]/10 text-[#22d3ee] text-xs font-bold rounded-full whitespace-nowrap">
                          {Math.round(item.score * 100)}% Match
                        </div>
                      )}

                      {/* オプションボタン */}
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