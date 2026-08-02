import { useState, useEffect, useMemo } from 'react';
import { Search, Clock, MonitorSmartphone, Trash2, MoreVertical, Menu, Minus, Plus, Settings, X } from 'lucide-react';

// ==========================================
// 🗄️ IndexedDB関連の関数
// ==========================================
function getAllHistoryFromDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("AnoWebDB", 5);
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
    const request = indexedDB.open("AnoWebDB", 5);
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
  
  // ★ UI・設定用のState
  const [zoomLevel, setZoomLevel] = useState(100);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [userSettings, setUserSettings] = useState({
    filterGoogle: true,  // Google検索を除外するか
    maxItems: 100,       // 履歴の最大表示数
  });

  // データ保持用のState
  const [rawDbData, setRawDbData] = useState([]); // DBから取得した生データ
  const [historyItems, setHistoryItems] = useState([]);
  const [allHistory, setAllHistory] = useState([]);

  // 1. 初回起動時にIndexedDBから本物のデータを読み込む
  useEffect(() => {
    getAllHistoryFromDB().then(data => {
      console.log("📚 DBから生データを読み込みました:", data.length, "件");
      setRawDbData(data);
    });
  }, []);

  // 2. ★ 設定が変わるたびに、リストをフィルタリング＆整形し直す
  useEffect(() => {
    if (rawDbData.length === 0) return;

    // 最新順にソート
    let sorted = [...rawDbData].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // ★ 設定1: Google検索フィルタ
    if (userSettings.filterGoogle) {
      sorted = sorted.filter(item => !(item.title && item.title.includes('- Google 検索')));
    }

    // ★ 設定2: 最大表示件数でカット
    sorted = sorted.slice(0, userSettings.maxItems);

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const formatted = sorted.map(item => {
      const date = new Date(item.timestamp);
      const isToday = date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
      const isYesterday = date.getDate() === yesterday.getDate() && date.getMonth() === yesterday.getMonth() && date.getFullYear() === yesterday.getFullYear();

      const baseDateStr = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
      
      let dateStr = baseDateStr;
      if (isToday) dateStr = `今日 - ${baseDateStr}`;
      else if (isYesterday) dateStr = `昨日 - ${baseDateStr}`;

      const searchDateKey = `${baseDateStr} ${date.getMonth() + 1}/${date.getDate()} ${date.getMonth() + 1}-${date.getDate()}`;

      let domain = item.currentUrl;
      try { domain = new URL(item.currentUrl).hostname; } catch (err) {}

      return {
        id: item.currentUrl, 
        time: `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`,
        dateStr: dateStr,
        searchDateKey: searchDateKey,
        title: item.title || "No Title",
        url: domain,
        icon: item.title ? item.title.charAt(0).toUpperCase() : 'W',
        originalUrl: item.currentUrl,
        vector: item.vector 
      };
    });
    
    setAllHistory(formatted);
    // 検索窓が空なら、すぐに表示リストにも反映
    if (!searchQuery.trim()) setHistoryItems(formatted);
  }, [rawDbData, userSettings]);

  // 3. AI検索処理（文字入力時）
  useEffect(() => {
    const performSearch = async () => {
      const query = searchQuery.trim();
      if (!query) {
        setHistoryItems(allHistory);
        return;
      }

      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(
          { type: 'VECTORIZE_QUERY', text: query },
          (response) => {
            if (response && response.vector) {
              const queryVector = response.vector;
              const scoredItems = allHistory.map(item => {
                if (!item.vector) return { ...item, score: 0 };
                const score = cosineSimilarity(queryVector, item.vector);
                return { ...item, score };
              });
              scoredItems.sort((a, b) => b.score - a.score);
              setHistoryItems(scoredItems);
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
        item.url.toLowerCase().includes(lowerQuery) ||
        item.searchDateKey.includes(lowerQuery)
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
    // 生データからも削除して再レンダリングをトリガー
    setRawDbData(prev => prev.filter(item => !selectedIds.has(item.currentUrl)));
    setSelectedIds(new Set());
  };

  return (
    <div className="flex h-screen w-full bg-[#18181A] text-[#E8EAED] font-sans overflow-hidden">
      
      {/* ⚙️ 設定モーダル */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#1E1E20] border border-[#3C3C3E] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3C3C3E]">
              <h2 className="text-lg font-bold text-[#E8EAED] flex items-center gap-2">
                <Settings size={20} className="text-[#00FF41]" />
                システム設定
              </h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-[#9AA0A6] hover:text-white transition-colors p-1">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* 設定項目: Google検索除外 */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-[#F4F4F5]">Google検索結果の除外</div>
                  <div className="text-xs text-[#71717A] mt-1">「- Google 検索」を含む履歴を非表示にします</div>
                </div>
                <button 
                  onClick={() => setUserSettings(prev => ({ ...prev, filterGoogle: !prev.filterGoogle }))}
                  className={`w-11 h-6 rounded-full transition-colors relative ${userSettings.filterGoogle ? 'bg-[#00FF41]' : 'bg-[#3C3C3E]'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${userSettings.filterGoogle ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* 設定項目: 最大表示件数 */}
              <div className="space-y-3">
                <div>
                  <div className="font-medium text-[#F4F4F5]">最大表示件数</div>
                  <div className="text-xs text-[#71717A] mt-1">画面に読み込む履歴の上限（軽くしたい場合は減らしてください）</div>
                </div>
                <input 
                  type="range" 
                  min="50" 
                  max="1000" 
                  step="50"
                  value={userSettings.maxItems}
                  onChange={(e) => setUserSettings(prev => ({ ...prev, maxItems: Number(e.target.value) }))}
                  className="w-full accent-[#00FF41] cursor-pointer"
                />
                <div className="text-right text-sm text-[#00FF41] font-bold">{userSettings.maxItems} 件</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* サイドバー */}
      <aside className={`flex flex-col bg-[#1E1E20] transition-all duration-300 border-r border-[#2C2C2E] ${isSidebarOpen ? 'w-64' : 'w-0 overflow-hidden border-none'}`}>
        <div className="h-16 flex items-center px-6 shrink-0">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => setIsSidebarOpen(false)}>
            <img src="/web_logo.png" alt="Ano-Web" className="w-14 h-14" />
            <span className="text-xl font-medium tracking-wide text-[#00FF41]">Ano-Web</span>
          </div>
        </div>

        <nav className="flex-1 py-4">
          <ul className="space-y-1">
            <li>
              <button className="w-full flex items-center gap-5 px-6 py-3 bg-[#00FF41]/10 text-[#00FF41] rounded-r-full font-medium">
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
          <div className="flex-1 max-w-[600px] relative">
            <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-[#9AA0A6]">
              <Search size={20} />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="調べたい言葉をふわっと入力 （AI検索対応 / 日付検索対応）"
              className="w-full h-12 pl-14 pr-4 bg-[#202022] border border-[#3C3C3E] rounded-full text-[#E8EAED] placeholder-[#71717A] focus:outline-none focus:border-[#00FF41] focus:bg-[#202022] transition-colors"
            />
          </div>

          {selectedIds.size > 0 ? (
            <div className="flex items-center gap-4 ml-auto animate-in fade-in duration-200">
              <span className="text-[#00FF41] text-sm font-medium">
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
          ) : (
            <div className="flex items-center gap-4 ml-auto">
              {/* 🔍 ズームコントローラー */}
              <div className="flex items-center gap-2 bg-[#202022] border border-[#3C3C3E] rounded-full px-4 py-1.5 hidden md:flex">
                <button 
                  onClick={() => setZoomLevel(prev => Math.max(50, prev - 10))} 
                  className="p-1 text-[#9AA0A6] hover:text-[#00FF41] hover:bg-[#2C2C2E] rounded transition-colors"
                  title="縮小"
                >
                  <Minus size={16} />
                </button>
                <span className="text-[#E8EAED] text-sm w-12 text-center font-medium select-none">
                  {zoomLevel}%
                </span>
                <button 
                  onClick={() => setZoomLevel(prev => Math.min(150, prev + 10))} 
                  className="p-1 text-[#9AA0A6] hover:text-[#00FF41] hover:bg-[#2C2C2E] rounded transition-colors"
                  title="拡大"
                >
                  <Plus size={16} />
                </button>
              </div>

              {/* ⚙️ 設定ボタン */}
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="w-10 h-10 flex items-center justify-center rounded-full text-[#9AA0A6] hover:bg-[#2C2C2E] hover:text-[#00FF41] transition-colors"
                title="システム設定"
              >
                <Settings size={20} />
              </button>
            </div>
          )}
        </header>

        {/* 履歴リストエリア */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div 
            className="max-w-[1000px] mx-auto bg-[#242426] border border-[#333336] rounded-2xl shadow-xl overflow-hidden py-2 transition-transform origin-top"
            style={{ zoom: zoomLevel / 100 }}
          >
            {historyItems.length === 0 ? (
              <div className="text-center text-[#71717A] py-20">
                <p>保存された履歴がまだありません。</p>
                <p className="text-sm mt-2">適当なページを開いて30秒待つと、ここに保存されます。</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {Object.entries(
                  historyItems.reduce((acc, item) => {
                    if (!acc[item.dateStr]) acc[item.dateStr] = [];
                    acc[item.dateStr].push(item);
                    return acc;
                  }, {})
                ).map(([dateStr, items]) => (
                  <div key={dateStr}>
                    <div className="px-6 py-2 bg-[#1E1E20] border-y border-[#333336] text-[#00FF41] text-sm font-bold tracking-wider sticky top-0 z-0">
                      {dateStr}
                    </div>
                    
                    {items.map((item) => {
                      const isSelected = selectedIds.has(item.id);
                      return (
                        <div 
                          key={item.id} 
                          className={`flex items-center group px-6 py-3 hover:bg-[#2C2C2E] transition-colors border-b border-[#333336]/50 last:border-none ${isSelected ? 'bg-[#2C2C2E]' : ''}`}
                          onClick={() => toggleSelection(item.id)}
                        >
                          <div className="w-12 flex justify-start shrink-0">
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              onChange={() => toggleSelection(item.id)} 
                              className="w-4 h-4 cursor-pointer accent-[#00FF41] bg-[#202124] border-[#9AA0A6] rounded"
                              onClick={(e) => e.stopPropagation()} 
                            />
                          </div>
                          <div className="w-20 text-[#9AA0A6] text-[15px] shrink-0 font-medium">
                            {item.time}
                          </div>
                          <div className="w-8 h-8 rounded bg-[#3A3A3C] flex items-center justify-center text-xs font-bold text-[#D4D4D8] shrink-0 mr-4">
                            {item.icon}
                          </div>
                          <div 
                            className="flex flex-1 items-baseline gap-4 min-w-0 pr-4 cursor-pointer"
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              window.open(item.originalUrl, '_blank', 'noopener,noreferrer');
                            }}
                            title="ダブルクリックでページを開く"
                          >
                            <span className="text-[15px] text-[#F4F4F5] truncate font-medium hover:text-[#00FF41] hover:underline transition-colors">
                              {item.title}
                            </span>
                            <span className="text-[13px] text-[#71717A] truncate">
                              {item.url}
                            </span>
                          </div>
                          {item.score !== undefined && item.score > 0 && searchQuery.trim() !== '' && (
                            <div className="mr-4 px-3 py-1 bg-[#00FF41]/10 text-[#00FF41] text-xs font-bold rounded-full whitespace-nowrap">
                              {Math.round(item.score * 100)}% Match
                            </div>
                          )}
                          <button className="w-8 h-8 rounded-full flex items-center justify-center text-[#71717A] opacity-0 group-hover:opacity-100 hover:bg-[#3C3C3E] transition-all">
                            <MoreVertical size={18} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}