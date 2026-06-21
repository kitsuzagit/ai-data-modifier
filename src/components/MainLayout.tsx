'use client';

import React, { useState, useEffect } from 'react';
import SidebarFooter from './SidebarFooter'; // 同じフォルダからの相対パス
import Link from 'next/link';
import { getUserHistory } from '../app/actions'; // 📄 履歴を取得するサーバーアクションをインポート

export default function MainLayout() {
  // 設定モーダルの開閉状態
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // モーダル内のタブ状態 ('modify' = データ修正, 'settings' = 設定)
  const [modalTab, setModalTab] = useState<'modify' | 'settings'>('settings');

  // 🆕 履歴データを管理する状態（State）を追加
  const [history, setHistory] = useState<any[]>([]);

  // 🆕 画面が表示されたときに、Supabaseから履歴一覧を自動取得する
  useEffect(() => {
    async function fetchHistory() {
      try {
        const data = await getUserHistory();
        setHistory(data);
      } catch (error) {
        console.error("履歴の取得に失敗しました:", error);
      }
    }
    fetchHistory();
  }, []);

  // アカウントダミーデータ
  const userEmail = 't.hiroki926@gmail.com';
  const currentUsage = 0;
  const maxUsage = 5;

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-zinc-950">
      
      {/* 左側：サイドバー */}
      <aside className="w-64 border-r border-gray-200 dark:border-zinc-850 flex flex-col justify-between bg-white dark:bg-zinc-900 select-none">
        <div className="p-4 flex-1 flex flex-col min-h-0">
          <div className="text-xs font-bold text-slate-400 dark:text-zinc-500 tracking-wider px-2 pt-2 mb-4">
            ワークスペース
          </div>

          {/* 🆕 ➕ 新規データ加工ボタン（過去データからいつでも真っ白に戻れるリンク） */}
          <div className="px-2 mb-6">
            <Link 
              href="/" 
              className="block w-full text-center bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 px-4 rounded-xl transition text-xs shadow-sm shadow-indigo-500/10"
            >
              ＋ 新規データ加工
            </Link>
          </div>

          {/* 🆕 📜 履歴リスト部分をここに合体！ */}
          <div className="flex-1 overflow-y-auto px-1 space-y-1">
            <div className="px-2 text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-2">
              前回の履歴
            </div>
            
            {history.length === 0 ? (
              <div className="text-xs text-slate-400 dark:text-zinc-500 px-2 py-4">
                履歴がありません
              </div>
            ) : (
              history.map((item) => (
                <Link
                  key={item.id}
                  href={`/?history_id=${item.id}`} // 💡 URLにIDを付与してメイン画面に伝える
                  className="block px-2.5 py-2 rounded-xl text-xs text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800/60 hover:text-slate-900 dark:hover:text-zinc-100 transition truncate"
                >
                  📄 {item.title || '無題のデータ'}
                </Link>
              ))
            )}
          </div>
        </div>

        {/* 左下アイコン：クリック時に設定タブを初期値にしてモーダルをオープン */}
        <SidebarFooter onOpenSettings={() => {
          setModalTab('settings');
          setIsSettingsOpen(true);
        }} />
      </aside>

      {/* 右側：メインコンテンツ */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ヘッダー */}
        <header className="h-14 border-b border-gray-200 dark:border-zinc-850 flex items-center justify-between px-6 bg-white dark:bg-zinc-900">
          <div className="text-sm font-semibold text-slate-700 dark:text-zinc-300">メイン画面</div>
          
          {/* 右上の設定アイコン（ここから開いても連動） */}
          <button 
            onClick={() => {
              setModalTab('settings');
              setIsSettingsOpen(true);
            }}
            className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors focus:outline-none"
            aria-label="設定画面を開く"
          >
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </header>

        <main className="flex-1 p-6 bg-slate-50 dark:bg-zinc-950">
          <p className="text-xs text-slate-400">ここに生成データやチャット等のコンテンツが表示されます。</p>
        </main>
      </div>

      {/* ────────────────────────────────────────────────────────
          🌟 モーダルウィンドウ
      ──────────────────────────────────────────────────────── */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          {/* 背景をクリックしたら閉じる */}
          <div className="absolute inset-0" onClick={() => setIsSettingsOpen(false)} />
          
          <div className="relative bg-white dark:bg-zinc-900 rounded-[28px] border border-gray-200 dark:border-zinc-800 shadow-2xl w-[540px] max-w-full mx-4 z-10 flex flex-col overflow-hidden">
            
            {/* モーダルヘッダー */}
            <div className="p-6 border-b border-gray-100 dark:border-zinc-800 flex items-start justify-between">
              <div className="space-y-1 text-left">
                <h3 className="text-base font-bold text-slate-800 dark:text-zinc-100 flex items-center gap-1.5">
                  ⚙️ アプリケーション設定
                </h3>
                <p className="text-[11px] text-slate-400 dark:text-zinc-500 leading-relaxed">
                  データの修正や、AI環境・アカウント設定を切り替えて操作できます。
                </p>
                
                <div className="inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-zinc-800/80 border border-gray-200/60 dark:border-zinc-700 text-[11px] font-semibold text-slate-500 dark:text-zinc-400 select-none">
                  <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <span>セキュリティ: 学習に利用されません</span>
                </div>
              </div>
              
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 rounded-full transition-colors focus:outline-none"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* モーダル内カプセルタブ */}
            <div className="px-6 py-3 bg-slate-50/60 dark:bg-zinc-900/40 border-b border-gray-100 dark:border-zinc-800/80 flex justify-start">
              <div className="flex items-center bg-[#eef1f4] dark:bg-zinc-850 p-1 rounded-[20px] border border-gray-200/40 dark:border-zinc-800/40 w-fit">
                
                {/* 数据修正 タブ */}
                <button
                  onClick={() => setModalTab('modify')}
                  className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold transition-all duration-150 rounded-[14px] ${
                    modalTab === 'modify'
                      ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                      : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                  }`}
                >
                  <span className="text-amber-500 text-[11px]">📁</span>
                  <span>データ修正</span>
                </button>

                {/* 設定タブ */}
                <button
                  onClick={() => setModalTab('settings')}
                  className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold transition-all duration-150 rounded-[14px] ${
                    modalTab === 'settings'
                      ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                      : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                  }`}
                >
                  <span className="text-purple-400 text-[11px]">⚙️</span>
                  <span>設定タブ</span>
                </button>
              </div>
            </div>

            {/* コンテンツエリア */}
            <div className="p-6 overflow-y-auto space-y-5 text-left font-sans max-h-[420px]">
              
              {modalTab === 'settings' ? (
                /* ⚙️ 設定タブ表示 */
                <>
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-400 dark:text-zinc-500 tracking-wider">AIエンジン・LLM環境</h4>
                    <div className="p-3.5 bg-indigo-50/30 dark:bg-zinc-900/40 rounded-2xl border border-indigo-100/50 dark:border-zinc-800 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 dark:text-zinc-500">使用中のAIモデル</span>
                        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">Gemini-2.5-Flash</span>
                      </div>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50">
                        ● APIステータス: 正常稼働中
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-400 dark:text-zinc-500 tracking-wider">認証アカウント情報</h4>
                    <div className="p-3.5 bg-slate-50 dark:bg-zinc-900/20 rounded-2xl border border-gray-100 dark:border-zinc-800 flex items-center justify-between gap-4">
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] text-slate-400 dark:text-zinc-500">サインイン中のGoogleアカウント</span>
                        <span className="text-xs font-bold text-slate-700 dark:text-zinc-300 mt-0.5 truncate">{userEmail}</span>
                      </div>
                      <button className="px-4 py-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-400 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl hover:bg-slate-50 transition-colors shadow-sm shrink-0">
                        ログアウト
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-400 dark:text-zinc-500 tracking-wider">プラン・お支払い設定</h4>
                    <div className="p-4.5 bg-slate-50 dark:bg-zinc-900/20 rounded-2xl border border-gray-100 dark:border-zinc-800 space-y-3.5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-slate-400 dark:text-zinc-500">現在のサブスクリプション状態</span>
                          <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 mt-0.5">無料プラン（1日5起算制限あり）</span>
                        </div>
                        <div className="px-2.5 py-1 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-zinc-400 shadow-sm shrink-0">
                          本日の使用回数: <span className="text-indigo-600 dark:text-indigo-400">{currentUsage}</span> / {maxUsage} 回
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-400 dark:text-zinc-500 leading-relaxed">
                        月額980円で、すべてのファイル形式（Excel/CSV/TXT/画像）のデータベース機能、およびAIによる修正・加工回数の制限が100%完全解除されます。
                      </p>
                      <button className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-500/10 transition-all flex items-center justify-center gap-1.5">
                        👑 プレミアムへアップグレード
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                /* 📁 データ修正タブ表示 */
                <div className="space-y-3 py-2">
                  <h4 className="text-xs font-bold text-slate-400 dark:text-zinc-500 tracking-wider">データ修正・管理</h4>
                  <div className="p-8 bg-slate-50 dark:bg-zinc-900/40 rounded-2xl border border-gray-100 dark:border-zinc-800 text-center space-y-2">
                    <span className="text-2xl block mb-1">📁</span>
                    <p className="text-xs font-bold text-slate-700 dark:text-zinc-200">データ修正ダッシュボード</p>
                    <p className="text-[11px] text-slate-400 dark:text-zinc-500 max-w-sm mx-auto leading-relaxed">
                      ここにデータベース上のレコード修正や、アップロードファイルのデータ整形タスクに関する設定項目を綺麗に並べることができます。
                    </p>
                  </div>
                </div>
              )}

            </div>

          </div>
        </div>
      )}

    </div>
  );
}