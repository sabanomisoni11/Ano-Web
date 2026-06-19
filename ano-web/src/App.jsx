import { useState } from 'react';
import { Search, Clock, MonitorSmartphone, Trash2, MoreVertical, Menu } from 'lucide-react';

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // デモ用の履歴データ（後ほど IndexedDB と background.js から取得するリアルデータに結合します）
  const [historyItems, setHistoryItems] = useState([
    { id: '1', time: '23:37', title: 'Working...', url: 'login.microsoftonline.com', icon: 'R' },
    { id: '2', time: '23:36', title: '<32303236944E93788A77944E97EF5F88EA9797955C2E786C7378>', url: 'ritsumei.ac.jp', icon: 'R' },
    { id: '3', time: '23:36', title: 'オンラインシラバス | 立命館大学', url: 'ritsumei.ac.jp', icon: 'R' },
    { id: '4', time: '23:00', title: '履歴書・職務経歴書を無料で作成「yagish（ヤギッシュ）」', url: 'rirekisho.yagish.jp', icon: 'Y' },
    { id: '5', time: '22:51', title: '八村塁が現役NBA選手ランキング100位にランクイン...「最高の大型3＆Dプレーヤーの1人」', url: 'news.yahoo.co.jp', icon: 'Y!' },
    { id: '6', time: '22:24', title: '立命館大学 学年歴 - Google 検索', url: 'google.com', icon: 'G' },
    { id: '7', time: '22:24', title: 'CAMPUS WEB | 立命館大学', url: 'cw.ritsumei.ac.jp', icon: 'R' },
  ]);

  // チェックボックスのON/OFF切り替え
  const toggleSelection = (id) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  // 選択した項目の削除処理
  const handleDeleteSelected = () => {
    setHistoryItems(historyItems.filter(item => !selectedIds.has(item.id)));
    setSelectedIds(new Set());
    // TODO: ここに chrome.history.deleteUrl を呼び出すバックエンド連携を書きます
  };

  return (
    <div className="flex h-screen w-screen bg-[#202124] text-[#E8EAED] font-sans overflow-hidden select-none">
      
      {/* サイドバー（見た目は本格的なChrome履歴画面をキープ） */}
      <aside className={`flex flex-col bg-[#202124] transition-all duration-300 border-r border-[#3C4043] ${isSidebarOpen ? 'w-64 shrink-0' : 'w-0 overflow-hidden border-none'}`}>
        <div className="h-16 flex items-center px-6 shrink-0 justify-between">
          <div className="flex items-center gap-3">
            {}
            {/* ↓ 元のChrome画像を、時計とAIをモチーフにした自作SVGロゴにリプレイス */}
            <svg className="w-7 h-7 text-[#8AB4F8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" stroke="#8AB4F8" strokeWidth="2" />
              {/* 時計の針を模したデザイン */}
              <polyline points="12 6 12 12 16 14" stroke="#8AB4F8" strokeWidth="2" />
              {/* AI/テクノロジー感を演出する光のドット */}
              <circle cx="12" cy="12" r="2" fill="#8AB4F8" />
              <circle cx="18" cy="6" r="1" fill="#8AB4F8" className="animate-pulse" />
              <line x1="12" y1="12" x2="18" y2="6" stroke="#8AB4F8" strokeWidth="1" strokeDasharray="2,2" />
            </svg>
            <span className="text-lg font-semibold tracking-wider bg-gradient-to-r from-[#8AB4F8] to-[#c598ff] bg-clip-text text-transparent">Ano-Web</span>
          </div>
        </div>

        <nav className="flex-1 py-2">
          <ul className="space-y-1">
            <li>
              <button className="w-full flex items-center gap-5 px-6 py-2.5 bg-[#8AB4F8]/10 text-[#8AB4F8] rounded-r-full font-medium text-left">
                <Clock size={20} />
                Chrome 履歴
              </button>
            </li>
            <li>
              <button className="w-full flex items-center gap-5 px-6 py-2.5 text-[#9AA0A6]/40 cursor-not-allowed rounded-r-full text-left" title="PC版デモのため、この機能は現在無効化されています">
                <MonitorSmartphone size={20} />
              {/*他のデバイスからのタブ
              </button>
            </li>
            <li>
              <button 
                onClick={handleDeleteSelected}
                disabled={selectedIds.size === 0}
                className={`w-full flex items-center gap-5 px-6 py-2.5 rounded-r-full font-medium transition-all text-left ${selectedIds.size > 0 ? 'text-red-400 hover:bg-red-500/10' : 'text-[#9AA0A6]/30 cursor-not-allowed'}`}
              >
                <Trash2 size={20} />*/}
                選択項目を削除
              </button>
            </li>
          </ul>
        </nav>
      </aside>

      {/* メインコンテンツエリア */}
      <main className="flex-1 flex flex-col h-full min-w-0 bg-[#202124]">
        
        {/* 上部ヘッダー（検索窓と操作ボタン） */}
        <header className="h-16 flex items-center px-6 gap-4 border-b border-[#3C4043] bg-[#292A2D] shrink-0 sticky top-0 z-10">
          {!isSidebarOpen && (
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-[#3C4043] rounded-full transition-colors text-[#9AA0A6]"
            >
              <Menu size={20} />
            </button>
          )}

          {/* 検索コンテナ（Ano-WebのAI検索窓） */}
          <div className="flex-1 max-w-[720px] relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#9AA0A6]">
              <Search size={20} />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="調べたい言葉をふわっと入力（AI検索対応）"
              className="w-full h-11 pl-12 pr-4 bg-[#202124] border border-[#5F6368]/60 rounded-full text-[#E8EAED] placeholder-[#9AA0A6] focus:outline-none focus:border-[#8AB4F8] focus:bg-[#202124] transition-colors"
            />
          </div>

          {/* 削除アクションバー */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 ml-auto">
              <span className="text-[#8AB4F8] text-xs font-medium">
                {selectedIds.size} 件を選択中
              </span>
              <button 
                onClick={handleDeleteSelected}
                className="px-3.5 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <Trash2 size={14} />
                削除
              </button>
              <button 
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1.5 hover:bg-[#3C4043] text-[#9AA0A6] rounded text-xs font-medium transition-colors"
              >
                キャンセル
              </button>
            </div>
          )}
        </header>

        {/* 履歴リストエリア */}
        <div className="flex-1 overflow-y-auto bg-[#202124] px-6 py-4">
          <div className="max-w-[960px] mx-auto">
            
            <div className="flex flex-col rounded-xl border border-[#3C4043]/60 bg-[#292A2D] overflow-hidden shadow-lg">
              {historyItems
                .filter(item => 
                  item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  item.url.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((item) => {
                  const isSelected = selectedIds.has(item.id);
                  return (
                    <div 
                      key={item.id} 
                      className={`flex items-center group px-5 py-3.5 hover:bg-[#35363a] transition-colors cursor-pointer border-b border-[#3C4043]/40 last:border-b-0 ${isSelected ? 'bg-[#35363a]' : ''}`}
                      onClick={() => toggleSelection(item.id)}
                    >
                      {/* チェックボックス */}
                      <div className="w-10 flex justify-start shrink-0">
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          onChange={() => {}} // 親のクリックで処理するため空関数
                          className="w-4 h-4 cursor-pointer accent-[#8AB4F8] bg-[#202124] border-[#9AA0A6] rounded-sm"
                          onClick={(e) => e.stopPropagation()} 
                        />
                      </div>

                      {/* 時間 */}
                      <div className="w-16 text-[#9AA0A6] text-sm shrink-0">
                        {item.time}
                      </div>

                      {/* ファビコン代わりのアバター */}
                      <div className="w-7 h-7 rounded-md bg-[#3C4043] flex items-center justify-center text-[11px] font-bold text-gray-300 shrink-0 mr-4">
                        {item.icon}
                      </div>

                      {/* タイトルとURL */}
                      <div className="flex flex-1 items-baseline gap-4 min-w-0 pr-4">
                        <span className="text-[14px] text-gray-200 truncate font-normal">
                          {item.title}
                        </span>
                        <span className="text-[12px] text-[#9AA0A6] truncate font-light">
                          {item.url}
                        </span>
                      </div>

                      {/* 三点リーダー（オプションボタン） */}
                      <button className="w-8 h-8 rounded-full flex items-center justify-center text-[#9AA0A6] opacity-0 group-hover:opacity-100 hover:bg-[#3C4043] transition-all">
                        <MoreVertical size={16} />
                      </button>
                    </div>
                  );
                })}
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}