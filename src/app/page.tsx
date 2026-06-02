'use client';

import { useState, useEffect } from 'react';
import {
  modifyData,
  createCheckoutSession,
  getUserStatus,
  loginWithGoogle,
  logout,
  createCustomerPortalSession
} from './actions';

import * as XLSX from 'xlsx';

interface SuggestedPrompt {
  label: string;
  text: string;
}

type MenuType = 'data-modification';

export default function Home() {
  const [activeMenu, setActiveMenu] = useState<MenuType>('data-modification');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [indicatorMenu, setIndicatorMenu] = useState<'main' | 'route' | 'pref'>('main');
  const [prefPosition, setPrefPosition] = useState<'tl' | 'tr' | 'bl' | 'br'>('bl');
  const [prefBadgeEnabled, setPrefBadgeEnabled] = useState<boolean>(true);

  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [dailyCount, setDailyCount] = useState<number>(0);
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  const [title, setTitle] = useState('');
  const [instruction, setInstruction] = useState('');
  const [payloadData, setPayloadData] = useState<string>('');
  const [hasData, setHasData] = useState<boolean>(false);
  const [fileExtension, setFileExtension] = useState<string>('txt');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [suggestedPrompts, setSuggestedPrompts] = useState<SuggestedPrompt[]>([]);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [portalLoading, setPortalLoading] = useState<boolean>(false);

  const FREE_LIMIT = 5;

  useEffect(() => {
    async function initAuth() {
      try {
        const query = new URLSearchParams(window.location.search);
        
        if (query.get('success')) {
          setSuccessMessage('👑 プレミアムプランへのアップグレードが完了しました！制限なしでご利用いただけます。');
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        if (query.get('canceled')) {
          setError('決済がキャンセルされました。');
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        const status = await getUserStatus();
        setIsLoggedIn(status.isLoggedIn);
        
        if (status.isLoggedIn) {
          setUserEmail(status.userEmail || '');
          setDailyCount(status.dailyCount);
          setIsPremium(status.isPremium);
        }
      } catch (err) {
        console.error('認証情報の取得に失敗しました:', err);
      } finally {
        setAuthLoading(false);
      }
    }
    initAuth();
  }, []);

  const handleLogin = async () => {
    try {
      setAuthLoading(true);
      await loginWithGoogle();
    } catch (err: any) {
      setError('ログイン処理の開始に失敗しました。');
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      setAuthLoading(true);
      await logout();
    } catch (err: any) {
      setError('ログアウト処理に失敗しました。');
      setAuthLoading(false);
    }
  };

  const handleUpgrade = async () => {
    try {
      setLoading(true);
      setError('');
      const checkoutUrl = await createCheckoutSession();
      window.location.href = checkoutUrl;
    } catch (err: any) {
      setError(err.message || '決済画面の移動に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPortal = async () => {
    try {
      setPortalLoading(true);
      setError('');
      const result = await createCustomerPortalSession();
      if (result && result.url) {
        window.location.href = result.url;
      } else {
        setError('管理画面ポータルの生成に失敗しました。サブスクリプション情報が確認できません。');
      }
    } catch (err: any) {
      setError(err.message || '管理画面の起動に失敗しました。');
    } finally {
      setPortalLoading(false);
    }
  };

  const executeModification = async (targetInstruction: string) => {
    if (!targetInstruction || !payloadData || loading) return;
    
    if (!isPremium && dailyCount >= FREE_LIMIT) {
      setError('本日の無料利用枠（5回）に達しました。プレミアムプランへのアップグレードをご検討ください。');
      return;
    }

    let parsedInstruction = targetInstruction;
    if (fileExtension === 'xlsx' || fileExtension === 'xls' || fileExtension === 'csv') {
      parsedInstruction += '。出力は必ず貼り付けられたデータと同じ有効なJSON配列の形式（Markdownのコードブロック等は使わない纯粋なJSONオブジェクトの文字列）で返却してください。';
    }

    setLoading(true);
    setError('');
    setResult('');
    setSuggestedPrompts([]);

    try {
      const activeTitle = title || '対象データ';
      const rawResText = await modifyData(activeTitle, payloadData, parsedInstruction);
      
      try {
        const parsedRes = JSON.parse(rawResText);
        if (parsedRes.modifiedData && parsedRes.suggestedPrompts) {
          setResult(parsedRes.modifiedData);
          setSuggestedPrompts(parsedRes.modifiedData.length > 0 ? parsedRes.suggestedPrompts : []);
          if (!isPremium) {
            setDailyCount(prev => prev + 1);
          }
        } else {
          setResult(rawResText);
        }
      } catch {
        setResult(rawResText);
      }
    } catch (err: any) {
      setError(err.message || '予期せぬエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || isLimitReached) return;
    executeModification(instruction);
  };

  const handlePromptClick = (text: string) => {
    if (!isPremium && dailyCount >= FREE_LIMIT) return;
    setInstruction(text);
    executeModification(text);
  };

  const handleDownload = () => {
    if (!result) return;

    const executeTextDownload = (textData: string, ext: string) => {
      const blob = new Blob([textData], { type: 'text/plain;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${title || 'output'}_修正済.${ext}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    try {
      if (fileExtension === 'xlsx' || fileExtension === 'xls' || fileExtension === 'csv') {
        let jsonData;
        try {
          jsonData = JSON.parse(result);
        } catch {
          executeTextDownload(result, fileExtension);
          return;
        }

        const worksheet = XLSX.utils.json_to_sheet(Array.isArray(jsonData) ? jsonData : [jsonData]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
        
        if (fileExtension === 'csv') {
          XLSX.writeFile(workbook, `${title || 'output'}_修正済.csv`, { bookType: 'csv' });
        } else {
          XLSX.writeFile(workbook, `${title || 'output'}_修正済.xlsx`, { bookType: 'xlsx' });
        }
      } else {
        executeTextDownload(result, fileExtension);
      }
    } catch (err) {
      executeTextDownload(result, 'txt');
    }
  };

  const handleClearAll = () => {
    setTitle('');
    setInstruction('');
    setPayloadData('');
    setHasData(false);
    setResult('');
    setError('');
    setSuggestedPrompts([]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const ext = file.name.split('.').pop()?.toLowerCase() || 'txt';
      setFileExtension(ext);
      setTitle(file.name.replace(/\.[^/.]+$/, ""));
      setError('');
      setHasData(false);
      setPayloadData('');
      setSuggestedPrompts([]);

      const reader = new FileReader();

      if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        reader.onload = (evt) => {
          try {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws);
            
            if (data.length > 0) {
              setPayloadData(JSON.stringify(data, null, 2));
              setHasData(true);
            } else {
              setError('ファイル内にデータが見つかりませんでした。');
            }
          } catch (err) {
            setError('ファイルの読み込みに失敗しました。');
          }
        };
        reader.readAsBinaryString(file);
      }
      else if (ext === 'txt') {
        reader.onload = (evt) => {
          const text = evt.target?.result as string;
          if (text.trim()) {
            setPayloadData(text);
            setHasData(true);
          } else {
            setError('テキストファイルが空です。');
          }
        };
        reader.readAsText(file, 'UTF-8');
      }
      else if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
        reader.onload = (evt) => {
          const base64String = evt.target?.result as string;
          if (base64String) {
            setPayloadData(base64String);
            setHasData(true);
          } else {
            setError('画像の読み込みに失敗しました。');
          }
        };
        reader.readAsDataURL(file);
      } else {
        setError('対応していないファイル形式です。');
      }
    }
  };

  if (authLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-[3px] border-indigo-600 border-t-transparent rounded-full animate-spin mb-3"></div>
        <div className="text-slate-600 font-bold text-sm tracking-wider">アプリケーションを起動中...</div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 text-slate-900 px-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-200/80 p-8 text-center">
          <div className="w-14 h-14 bg-indigo-50 rounded-xl flex items-center justify-center text-2xl mx-auto mb-4 border border-indigo-100/50">🤖</div>
          <h1 className="text-xl font-black text-slate-800 tracking-tight mb-2">AI DATA ENTRY ASSISTANT</h1>
          <p className="text-sm text-slate-500 mb-8 leading-relaxed max-w-sm mx-auto">
            Excel、CSV、画像内の表記揺れや誤入力をAIが一瞬で修正。ご利用には安全なアカウント認証が必要です。
          </p>
          <button
            onClick={handleLogin}
            className="w-full bg-slate-900 hover:bg-slate-800 text-sm font-bold py-3 px-5 rounded-lg transition-all shadow-md flex items-center justify-center gap-2 active:scale-[0.99] focus:outline-none text-white"
          >
            Googleアカウントでサインイン
          </button>
          {error && <p className="text-red-500 text-sm font-semibold mt-4 bg-red-50 py-2 px-3 rounded-lg border border-red-100">{error}</p>}
        </div>
        <p className="text-xs text-slate-400 mt-6 tracking-wide">Commercial MVP Version | Secure OAuth 2.0</p>
      </div>
    );
  }

  const isLimitReached = !isPremium && dailyCount >= FREE_LIMIT;

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans antialiased text-sm">
      <header className="bg-white border-b border-gray-200 px-6 py-3.5 flex justify-between items-center shrink-0 select-none">
        <div className="text-left">
          <h1 className="text-lg font-black tracking-tight text-slate-800">AI DATA ENTRY ASSISTANT</h1>
          <p className="text-xs text-slate-400 font-semibold tracking-wider mt-0.5">Commercial MVP Version</p>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 左側：ナビゲーション・サイドバー */}
        <aside className="w-64 bg-white border-r border-gray-200 p-4 pb-5 flex flex-col gap-5 shrink-0 select-none relative">
          <div className="text-left pt-0.5">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 pl-1">ファイルの追加</h2>
            <div className="space-y-1.5">
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 hover:border-indigo-500 bg-slate-50/50 hover:bg-indigo-50/10 p-4 rounded-xl cursor-pointer transition-all group">
                <span className="text-slate-600 group-hover:text-indigo-600 text-sm font-bold text-center leading-tight">
                  {hasData ? '✅ ファイルを変更する' : '＋ ファイルを選択'}
                  <span className="block text-xs text-slate-400 font-normal mt-1">Excel, CSV, TXT, 画像</span>
                </span>
                <input type="file" accept=".xlsx,.xls,.csv,.txt,.png,.jpg,.jpeg" className="hidden" onChange={handleFileChange} />
              </label>
            </div>
          </div>

          {/* おすすめ指示・プロンプト */}
          <div className="flex-1 flex flex-col min-h-0 text-left">
            {suggestedPrompts.length > 0 ? (
              <div className="flex flex-col h-full min-h-0">
                <div className="flex justify-between items-center mb-2 shrink-0">
                  <h2 className="text-xs font-extrabold uppercase tracking-widest text-indigo-600 flex items-center gap-1"><span>✨</span> 次の指示案</h2>
                  <button onClick={handleClearAll} className="text-xs text-slate-400 hover:text-slate-600 underline focus:outline-none">クリア</button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
                  {suggestedPrompts.map((prompt, index) => (
                    <button
                      key={index}
                      type="button"
                      disabled={isLimitReached}
                      onClick={() => handlePromptClick(prompt.text)}
                      className={`w-full text-left text-sm p-3 rounded-xl border bg-gradient-to-br from-indigo-50/30 to-blue-50/10 border-indigo-100/70 text-indigo-950 transition-all focus:outline-none ${
                        isLimitReached ? 'opacity-40 cursor-not-allowed' : 'hover:border-indigo-400 hover:shadow-sm'
                      } ${instruction === prompt.text ? 'border-indigo-600 ring-1 ring-indigo-600 bg-indigo-50/50' : ''}`}
                    >
                      <div className="font-bold text-indigo-900 flex items-center gap-1 mb-0.5 text-sm"><span>💡</span> {prompt.label}</div>
                      <div className="text-xs text-slate-500 leading-relaxed line-clamp-2">{prompt.text}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : hasData ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/60 text-center space-y-1.5">
                <span className="text-xl block">📥</span>
                <h3 className="text-sm font-bold text-slate-700 mt-0.5">データ準備完了</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  データの読み込みを確認しました。最下部の入力バーからAIへの修正指示を入力してください。
                </p>
                <button onClick={handleClearAll} className="text-xs text-red-500 hover:text-red-600 underline font-semibold mt-1 block mx-auto focus:outline-none">クリアする</button>
              </div>
            ) : null}
          </div>
        </aside>

        {/* 右側：メインコンテンツ・プレビューエリア & 下部固定入力バー */}
        <main className="flex-1 flex flex-col min-h-0 bg-slate-50 relative">
          <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-4 text-left pb-24">
            {activeMenu === 'data-modification' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex-1 flex flex-col min-h-0">
                {successMessage && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-3 shrink-0 flex justify-between items-center animate-fade-in">
                    <p className="text-emerald-800 text-sm font-bold">{successMessage}</p>
                    <button onClick={() => setSuccessMessage('')} className="text-emerald-400 hover:text-emerald-600 text-sm focus:outline-none">✕</button>
                  </div>
                )}

                {/* AI解析・修正結果のプレビュー枠（全面表示） */}
                <div className="flex justify-between items-center mb-2 shrink-0">
                  <h3 className="text-xs font-bold text-slate-500 tracking-wider uppercase">
                    ✨ AI解析・修正結果のプレビュー {title && <span className="text-xs font-bold text-slate-400 normal-case ml-2">（対象: {title}）</span>}
                  </h3>
                  {result && (
                    <div className="flex gap-1.5 items-center">
                      <button
                        type="button"
                        onClick={() => setActiveMenu('data-modification')}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all focus:outline-none ${
                          activeMenu === 'data-modification'
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        📁 データ修正
                      </button>
                      <button onClick={() => navigator.clipboard.writeText(result)} className="text-xs bg-slate-100 hover:bg-slate-200 font-bold text-slate-600 px-2.5 py-1.5 rounded-lg transition-colors focus:outline-none">コピー</button>
                      <button onClick={handleDownload} className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-sm transition-colors focus:outline-none">📥 ダウンロード ({fileExtension.toUpperCase()})</button>
                    </div>
                  )}
                </div>
                
                {/* 結果表示ビュー */}
                <div className={`flex-1 bg-slate-50 border border-slate-200 rounded-xl p-4 font-mono text-xs overflow-y-auto flex flex-col ${
                  loading || isLimitReached || !result ? 'justify-center items-center' : 'justify-start items-start'
                }`}>
                  {loading ? (
                    <div className="text-slate-500 text-xs font-bold animate-pulse flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                      AIまたは決済システムを呼び出し中...
                    </div>
                  ) : isLimitReached ? (
                    <div className="max-w-sm text-center p-6 bg-white rounded-xl shadow-lg border border-red-100/80 animate-fade-in">
                      <p className="text-2xl mb-1.5">💡</p>
                      <h4 className="text-red-600 font-bold text-sm uppercase tracking-wider mb-2">本日の無料利用枠（5回）に達しました</h4>
                      <p className="text-xs text-slate-400 mb-5 leading-relaxed">
                        プレミアムプラン（月額980円）へ加入すると、制限が完全に解除され、大量のデータでも無制限に即時加工・修正が行えるようになります。
                      </p>
                      <button
                        onClick={handleUpgrade}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl transition-colors shadow-md text-sm focus:outline-none"
                      >
                        👑 プレミアムプランへアップグレード
                      </button>
                    </div>
                  ) : result ? (
                    <div className="w-full h-full text-left font-mono text-xs text-slate-800 whitespace-pre overflow-auto">
                      {result}
                    </div>
                  ) : (
                    <div className="text-slate-400 text-xs font-medium text-center">
                      <span className="text-xl block mb-1">📋</span>
                      左メニューからファイルをアップロードし、下部の指示バーから指示を実行すると、ここにAIの修正結果が表示されます。
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 📥 下部固定：AI指示入力バー */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent pt-6 pb-4 px-6 border-t border-slate-200/60 shrink-0">
            <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  disabled={loading || isLimitReached}
                  placeholder={
                    isLimitReached 
                      ? "本日の無料制限に達しました" 
                      : hasData 
                        ? "例: 『住所の表記揺れを修正して』『不要な空欄行を削除して』など" 
                        : "ファイルを左メニューから選択してください"
                  }
                  className="w-full bg-white text-slate-800 border border-slate-300/80 rounded-xl pl-4 pr-12 py-3 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-sm transition-all disabled:bg-slate-100 disabled:text-slate-400"
                />
                <span className="absolute right-4 top-1.5 text-lg select-none pointer-events-none opacity-60">✨</span>
              </div>
              <button
                type="submit"
                disabled={loading || isLimitReached || !instruction.trim() || !hasData}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-5 py-3 rounded-xl transition-all shadow-sm flex items-center gap-1.5 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <span>実行</span>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </form>
            {error && (
              <p className="text-red-500 text-xs font-medium text-center mt-2 animate-fade-in max-w-xl mx-auto">
                ⚠️ {error}
              </p>
            )}
          </div>
        </main>
      </div>

      {/* ⚙️ 統合システムメニュー（設定位置グループ） */}
      <div className={`fixed z-50 flex flex-col gap-2 ${
        prefPosition === 'br' ? 'bottom-5 right-5 items-end' :
        prefPosition === 'bl' ? 'bottom-5 left-[17rem] items-start' :
        prefPosition === 'tr' ? 'top-5 right-5 items-end flex-col-reverse' :
        'top-5 left-[17rem] items-start flex-col-reverse'
      }`}>
        {isSettingsOpen && (
          <div className="w-64 bg-white rounded-xl shadow-[0_10px_35px_rgba(0,0,0,0.15)] border border-slate-200 p-2 text-left text-sm text-slate-700 animate-fade-in">
            {indicatorMenu === 'main' && (
              <div className="space-y-1">
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-xs space-y-1.5">
                  <div className="flex justify-between items-center font-bold">
                    <span className="truncate max-w-[130px] font-mono text-slate-800 text-sm tracking-tight">{userEmail || 't.hiroki926@gmail.com'}</span>
                    <button onClick={handleLogout} className="text-xs bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-500 font-semibold shadow-sm hover:bg-slate-50 transition-colors">ログアウト</button>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 font-medium">
                    <span>{isPremium ? '👑 プレミアム' : '無料プラン'}</span>
                    <span>本日: {dailyCount}/{FREE_LIMIT}回</span>
                  </div>
                  {!isPremium ? (
                    <button onClick={handleUpgrade} className="w-full text-center bg-[#4f46e5] hover:bg-[#4338ca] text-white font-bold py-1.5 rounded text-xs mt-1 transition-colors tracking-wide shadow-sm">アップグレード</button>
                  ) : (
                    <button onClick={handleOpenPortal} className="w-full text-center bg-slate-800 hover:bg-slate-900 text-white font-bold py-1.5 rounded text-xs mt-1 transition-colors tracking-wide shadow-sm">決済ポータル</button>
                  )}
                </div>

                <hr className="border-slate-100/80 my-1" />

                <div className="flex items-center justify-between px-2 py-1.5 rounded bg-slate-100 text-slate-800 font-medium select-none text-xs">
                  <span>Route</span>
                  <span className="bg-slate-200 text-slate-700 font-mono px-1.5 py-0.5 rounded text-[10px] font-bold">{prefBadgeEnabled ? 'Static' : 'Hidden'}</span>
                </div>
                
                <div className="flex items-center justify-between px-2 py-1.5 text-slate-800 font-medium select-none text-xs">
                  <span>Bundler</span>
                  <span className="text-slate-500 font-mono text-xs">Turbopack</span>
                </div>

                {/* 🔄 LLM Version を gemini-2.5-flash にアップデート */}
                <div className="flex items-center justify-between px-2 py-1.5 text-slate-800 font-medium select-none text-xs border-t border-slate-100/70 pt-1.5">
                  <span>LLM Version</span>
                  <span className="text-indigo-600 font-bold font-mono bg-indigo-50/70 px-1.5 py-0.5 rounded text-[10px]">gemini-2.5-flash</span>
                </div>

                <hr className="border-slate-100/80 my-1" />

                <div 
                  onClick={() => setIndicatorMenu('route')}
                  className="flex items-center justify-between px-2 py-1.5 text-slate-800 font-medium cursor-pointer hover:bg-slate-50 rounded text-xs transition-colors group"
                >
                  <span className="group-hover:text-indigo-600 transition-colors">Route Info</span>
                  <svg className="w-3 h-3 text-slate-400 group-hover:text-indigo-500 transition-colors" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>

                <div 
                  onClick={() => setIndicatorMenu('pref')}
                  className="flex items-center justify-between px-2 py-1.5 text-slate-800 font-medium cursor-pointer hover:bg-slate-50 rounded text-xs transition-colors group"
                >
                  <span className="group-hover:text-indigo-600 transition-colors">Preferences</span>
                  <svg className="w-3 h-3 text-slate-400 group-hover:text-indigo-500 transition-colors" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </div>
              </div>
            )}

            {indicatorMenu === 'route' && (
              <div className="p-0.5 space-y-2.5">
                <button 
                  onClick={() => setIndicatorMenu('main')}
                  className="flex items-center gap-1 text-slate-500 hover:text-slate-800 font-bold text-xs focus:outline-none"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to Menu
                </button>
                <div className="space-y-1.5 text-xs bg-slate-50 p-2 rounded-lg border border-slate-100">
                  <div className="flex justify-between py-0.5 border-b border-slate-200/60">
                    <span className="text-slate-400 font-medium">Route Path</span>
                    <span className="font-mono font-bold text-slate-800">/</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-slate-200/60">
                    <span className="text-slate-400 font-medium">Type</span>
                    <span className="bg-slate-950 text-white font-mono px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold">○ Static</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-slate-200/60">
                    <span className="text-slate-400 font-medium">Size</span>
                    <span className="text-slate-700 font-mono font-medium">78.4 KB</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-slate-400 font-medium">First Load JS</span>
                    <span className="text-slate-700 font-mono font-medium">112 KB</span>
                  </div>
                </div>
              </div>
            )}

            {indicatorMenu === 'pref' && (
              <div className="p-0.5 space-y-2.5">
                <button 
                  onClick={() => setIndicatorMenu('main')}
                  className="flex items-center gap-1 text-slate-500 hover:text-slate-800 font-bold text-xs focus:outline-none"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to Menu
                </button>
                <div className="space-y-2.5 text-xs">
                  <div>
                    <span className="text-slate-400 font-semibold block mb-1.5">Indicator Position</span>
                    <div className="grid grid-cols-2 gap-1 text-xs font-bold">
                      {([ 'tl', 'tr', 'bl', 'br' ] as const).map((pos) => (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => setPrefPosition(pos)}
                          className={`p-1.5 border rounded transition-all ${
                            prefPosition === pos 
                              ? 'bg-slate-950 text-white border-slate-950 shadow-sm' 
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {pos === 'tl' && 'Top-Left'}
                          {pos === 'tr' && 'Top-Right'}
                          {pos === 'bl' && 'Bottom-Left'}
                          {pos === 'br' && 'Bottom-Right'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                    <span className="text-slate-400 font-semibold">Route Badge</span>
                    <button
                      type="button"
                      onClick={() => setPrefBadgeEnabled(!prefBadgeEnabled)}
                      className={`text-xs font-bold px-2 py-1 rounded border transition-colors ${
                        prefBadgeEnabled ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {prefBadgeEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 📥 枠線付き重厚ダーク丸ボタン & フェードエフェクト「N」ロゴ */}
        <button
          type="button"
          onClick={() => setIsSettingsOpen(!isSettingsOpen)}
          className="w-11 h-11 bg-[#242424] hover:bg-[#2c2c2c] text-white rounded-full flex items-center justify-center shadow-[0_4px_22px_rgba(0,0,0,0.4)] active:scale-95 transition-all focus:outline-none border border-neutral-700/70 select-none group"
        >
          <svg 
            className="w-4 h-4 text-white" 
            viewBox="0 0 24 24" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {/* Nロゴの右側が下に向かって綺麗に消えていくグラデーション定義 */}
              <linearGradient id="nextNEdgeGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.15" />
              </linearGradient>
            </defs>
            {/* 右側のフェード縦線 */}
            <path d="M17 6V15" stroke="url(#nextNEdgeGlow)" strokeWidth="2.6" strokeLinecap="round" />
            {/* 左縦線と斜め繋ぎ線 */}
            <path d="M7 18V6L16.5 17.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}