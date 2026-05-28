// src/app/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { 
  modifyData, 
  createCheckoutSession, 
  getUserStatus, 
  loginWithGoogle, 
  logout,
  createCustomerPortalSession // 💳 カスタマーポータル関数を追加
} from './actions';
import * as XLSX from 'xlsx';

interface SuggestedPrompt {
  label: string;
  text: string;
}

export default function Home() {
  // --- 会員状態・利用制限のためのステート ---
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [dailyCount, setDailyCount] = useState<number>(0);
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  // --- アプリ機能用のステート ---
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
  const [portalLoading, setPortalLoading] = useState<boolean>(false); // ポータル用のローディング

  const FREE_LIMIT = 5; // 無料枠の上限回数

  // 🛠️ 画面起動時に最新のユーザー状態を取得
  useEffect(() => {
    async function initAuth() {
      try {
        // 1. Stripeリダイレクトの検出
        const query = new URLSearchParams(window.location.search);
        if (query.get('success')) {
          setSuccessMessage('👑 プレミアムプランへのアップグレードが完了しました！制限なしでご利用いただけます。');
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        if (query.get('canceled')) {
          setError('決済がキャンセルされました。');
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        // 2. 最新のステータス（ログイン・プレミアム・カウント）をサーバーから取得
        const status = await getUserStatus();
        setIsLoggedIn(status.isLoggedIn);
        if (status.isLoggedIn) {
          setUserEmail(status.userEmail || '');
          setIsPremium(status.isPremium);
          setDailyCount(status.dailyCount);
          if (query.get('success')) setIsPremium(true); // 決済直後の即時反映用
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

  // 💳 Stripeカスタマーポータル（管理・解約）を開く関数
  const handleOpenPortal = async () => {
    try {
      setPortalLoading(true);
      setError('');
      const result = await createCustomerPortalSession();
      if (result && result.url) {
        window.location.href = result.url;
      }
    } catch (err: any) {
      setError(err.message || '管理画面の起動に失敗しました。');
    } finally {
      setPortalLoading(false);
    }
  };

  const executeModification = async (targetInstruction: string) => {
    if (!targetInstruction || !payloadData) return;
    
    // 🛑 サーバーにリクエストを投げる前に、無料枠を超えていないかフロント側でも厳重にチェック
    if (!isPremium && dailyCount >= FREE_LIMIT) {
      setError('本日の無料利用枠（5回）に達しました。プレミアムプランへのアップグレードをご検討ください。');
      return;
    }

    setLoading(true);
    setError('');
    setResult('');
    setSuggestedPrompts([]); 

    try {
      const activeTitle = title || '対象データ';
      const rawResText = await modifyData(activeTitle, payloadData, targetInstruction);
      const parsedRes = JSON.parse(rawResText);
      
      if (parsedRes.modifiedData && parsedRes.suggestedPrompts) {
        setResult(parsedRes.modifiedData);
        setSuggestedPrompts(parsedRes.suggestedPrompts); 
        if (!isPremium) {
          setDailyCount(prev => prev + 1);
        }
      } else {
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
    executeModification(instruction);
  };

  const handlePromptClick = (text: string) => {
    if (!isPremium && dailyCount >= FREE_LIMIT) return; // 残枠ゼロの時はおすすめ指示もクリック無効化
    setInstruction(text);
    executeModification(text);
  };

  const handleDownload = () => {
    if (!result) return;
    const downloadFileName = `${title || 'output'}_修正済.${fileExtension}`;

    try {
      if (fileExtension === 'xlsx' || fileExtension === 'xls' || fileExtension === 'csv') {
        const jsonData = JSON.parse(result);
        const worksheet = XLSX.utils.json_to_sheet(jsonData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
        
        if (fileExtension === 'csv') {
          XLSX.writeFile(workbook, downloadFileName, { bookType: 'csv' });
        } else {
          XLSX.writeFile(workbook, downloadFileName, { bookType: 'xlsx' });
        }
      } else {
        const blob = new Blob([result], { type: 'text/plain;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', downloadFileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      const blob = new Blob([result], { type: 'text/plain;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${title || 'output'}_修正済.txt`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
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
      <div className="h-screen w-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-500 animate-pulse font-medium">アプリケーションを起動中...</div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-50 text-gray-900 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">🤖</div>
          <h1 className="text-2xl font-black text-gray-800 tracking-tight mb-2">AI DATA ENTRY ASSISTANT</h1>
          <p className="text-sm text-gray-500 mb-8 leading-relaxed">
            Excel、CSV、画像内の表記揺れや誤入力をAIが一瞬で修正。ご利用には安全なアカウント認証が必要です。
          </p>
          <button
            onClick={handleLogin}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 px-4 rounded-xl transition-all shadow flex items-center justify-center gap-3 active:scale-[0.99]"
          >
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C17.955 2.192 15.34 1 12.24 1 6.033 1 12.24 1 6.033 1 12.24s5.033 11.24 11.24 11.24c6.478 0 10.793-4.537 10.793-10.986 0-.74-.08-1.3-.175-1.85H12.24z"/>
            </svg>
            Googleアカウントでサインイン
          </button>
          {error && <p className="text-red-500 text-xs font-medium mt-4">{error}</p>}
        </div>
        <p className="text-xs text-gray-400 mt-6">Commercial MVP Version | Secure OAuth 2.0</p>
      </div>
    );
  }

  // 🛑 無料枠の上限に達しているかの判定フラグ
  const isLimitReached = !isPremium && dailyCount >= FREE_LIMIT;

  return (
    <div className="flex flex-col h-screen bg-gray-100 text-gray-900 font-sans">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-800">AI DATA ENTRY ASSISTANT</h1>
          <p className="text-xs text-gray-500">Commercial MVP Version</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-medium">
            AIモデル: Gemini-2.5-Flash
          </div>
          <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
            <span className="text-xs text-gray-600 max-w-[140px] truncate font-medium">{userEmail}</span>
            <button 
              onClick={handleLogout}
              className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 px-2.5 py-1 rounded-md transition-colors"
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 bg-white border-r border-gray-200 p-4 flex flex-col gap-5 shrink-0">
          <div className="bg-gradient-to-br from-gray-900 to-slate-800 text-white rounded-xl p-4 shadow-sm">
            <h3 className="text-[11px] uppercase font-bold tracking-wider text-gray-400 mb-2">アカウント状態</h3>
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-medium">
                {isPremium ? (
                  <span className="text-emerald-400 font-bold">✨ プレミアム会員</span>
                ) : (
                  <span className="text-indigo-400 font-bold">無料プラン</span>
                )}
              </span>
            </div>
            
            {!isPremium ? (
              <>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-gray-300">
                    <span>本日の残り枠</span>
                    <span>{Math.max(0, FREE_LIMIT - dailyCount)} / {FREE_LIMIT} 回</span>
                  </div>
                  <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-indigo-500 h-full transition-all duration-300" 
                      style={{ width: `${Math.max(0, ((FREE_LIMIT - dailyCount) / FREE_LIMIT) * 100)}%` }}
                    ></div>
                  </div>
                </div>
                <button
                  onClick={handleUpgrade}
                  disabled={loading}
                  className="w-full mt-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors shadow-md disabled:opacity-50"
                >
                  {loading ? '処理中...' : '👑 プレミアムへ進む（月額980円）'}
                </button>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-[11px] text-emerald-300 leading-relaxed bg-emerald-950/50 p-2 rounded border border-emerald-800/50">
                  🎉 すべての機能制限が解除され、無制限にAIデータ修正をご利用いただけます。
                </p>
                {/* 💳 プレミアム会員専用のサブスク解約・管理ポータルボタン */}
                <button
                  onClick={handleOpenPortal}
                  disabled={portalLoading}
                  className="w-full bg-gray-700 hover:bg-gray-600 text-white text-[11px] font-bold py-1.5 px-2 rounded transition-colors disabled:opacity-50"
                >
                  {portalLoading ? 'ポータル起動中...' : '💳 プランの確認・解約'}
                </button>
              </div>
            )}
          </div>

          <hr className="border-gray-200" />

          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">ファイルの追加</h2>
            <div className="space-y-2">
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 hover:border-indigo-500 p-4 rounded-lg cursor-pointer transition-colors group">
                <span className="text-gray-500 group-hover:text-indigo-600 text-sm font-medium text-center">
                  {hasData ? '✅ ファイルを変更する' : '＋ ファイルを選択'}
                  <span className="block text-[10px] text-gray-400 font-normal mt-1">Excel, CSV, TXT, 画像</span>
                </span>
                <input type="file" accept=".xlsx,.xls,.csv,.txt,.png,.jpg,.jpeg" className="hidden" onChange={handleFileChange} />
              </label>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            {suggestedPrompts.length > 0 ? (
              <div className="flex flex-col h-full min-h-0">
                <div className="flex justify-between items-center mb-2 shrink-0">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600">✨ 次のおすすめ指示</h2>
                  <button onClick={handleClearAll} className="text-[10px] text-gray-400 hover:text-gray-600 underline">クリア</button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2">
                  {suggestedPrompts.map((prompt, index) => (
                    <button
                      key={index}
                      type="button"
                      disabled={isLimitReached} // 🛑 無料枠制限時はクリック不可
                      onClick={() => handlePromptClick(prompt.text)}
                      className={`w-full text-left text-xs p-3 rounded-lg border bg-gradient-to-br from-indigo-50/50 to-blue-50/30 border-indigo-100 text-indigo-950 transition-all ${
                        isLimitReached ? 'opacity-40 cursor-not-allowed' : 'hover:border-indigo-500'
                      } ${instruction === prompt.text ? 'border-indigo-600 ring-1 ring-indigo-600 bg-indigo-50' : ''}`}
                    >
                      <div className="font-bold text-indigo-900 flex items-center gap-1 mb-1"><span>💡</span> {prompt.label}</div>
                      <div className="text-[11px] text-gray-600">{prompt.text}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : hasData ? (
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-center">
                <span className="text-lg">📥</span>
                <h3 className="text-xs font-bold text-gray-700 mt-1 mb-1">ファイルの読み込み完了</h3>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  「{title}」の準備ができました。下の入力バーから最初の修正指示を送ってください。
                </p>
              </div>
            ) : null}
          </div>
          <div className="mt-auto border-t border-gray-100 pt-3 text-[11px] text-gray-400 shrink-0">セキュリティ: 学習に利用されません</div>
        </aside>

        <main className="flex-1 p-6 overflow-y-auto flex flex-col gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex-1 flex flex-col min-h-0">
            {successMessage && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-4 shrink-0 flex justify-between items-center">
                <p className="text-emerald-800 text-xs font-bold">{successMessage}</p>
                <button onClick={() => setSuccessMessage('')} className="text-emerald-400 hover:text-emerald-600 text-xs">✕</button>
              </div>
            )}

            <div className="flex justify-between items-center mb-3 shrink-0">
              <h3 className="text-sm font-semibold text-gray-700">
                AI解析・修正結果のプレビュー {title && <span className="text-xs font-normal text-gray-400 ml-2">（対象: {title}）</span>}
              </h3>
              {result && (
                <div className="flex gap-2">
                  <button onClick={() => navigator.clipboard.writeText(result)} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2.5 py-1 rounded">コピー</button>
                  <button onClick={handleDownload} className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-3 py-1 rounded shadow-sm">📥 ダウンロード ({fileExtension.toUpperCase()})</button>
                </div>
              )}
            </div>
            
            <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap overflow-y-auto flex flex-col justify-center items-center">
              {loading ? (
                <div className="text-gray-400 animate-pulse">AIまたは決済システムを呼び出し中...</div>
              ) : isLimitReached ? (
                /* ⚠️ 無料枠の上限に達した場合の特別アップグレード訴求UI */
                <div className="max-w-md text-center p-6 bg-white rounded-xl shadow-sm border border-red-100">
                  <p className="text-2xl mb-2">💡</p>
                  <h4 className="text-red-600 font-bold text-sm mb-2">本日の無料利用枠（5回）に達しました</h4>
                  <p className="text-xs text-gray-500 mb-5 leading-relaxed">
                    プレミアムプラン（月額980円）へ加入すると、制限が完全に解除され、大量のデータでも無制限に即時加工・修正が行えるようになります。
                  </p>
                  <button
                    onClick={handleUpgrade}
                    className="w-full py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:opacity-95 text-white font-bold text-xs rounded-lg shadow transition-opacity"
                  >
                    👑 プレミアムプランで無制限にする
                  </button>
                </div>
              ) : result ? (
                <div className="w-full h-full text-left self-start font-mono text-sm text-gray-800">{result}</div>
              ) : (
                <div className="text-gray-400 text-center">
                  <p className="text-xl mb-1">🤖</p>
                  <p className="text-xs italic">
                    {hasData ? `「${title}」がセットされました。` : '左側でファイルをアップロードし、'}<br />下の入力バーから修正指示を送ってください。
                  </p>
                </div>
              )}
            </div>
            
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-2 shrink-0">
                <p className="text-red-600 text-xs font-medium">{error}</p>
                {error.includes('無料利用枠') && (
                  <button onClick={handleUpgrade} className="text-xs text-indigo-600 font-bold underline mt-1 block hover:text-indigo-800">
                    ここをクリックしてプレミアムプラン（制限解除）に進む ➔
                  </button>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      <footer className="bg-white border-t border-gray-200 p-4 shrink-0">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex gap-3">
          <input
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={
              isLimitReached 
                ? "無料利用枠の上限に達したためロックされています" 
                : hasData ? "修正・解析の指示を入力して実行..." : "先にデータを準備（選択）してください"
            }
            className="flex-1 border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-sm disabled:bg-gray-50 disabled:text-gray-400"
            disabled={loading || !hasData || isLimitReached} // 🛑 上限到達時は入力不可
          />
          <button
            type="submit"
            disabled={loading || !instruction || !hasData || isLimitReached} // 🛑 上限到達時は実行不可
            className={`px-6 py-3 rounded-lg text-white font-medium text-sm shadow transition-colors shrink-0 ${
              loading || !instruction || !hasData || isLimitReached ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            実行
          </button>
        </form>
      </footer>
    </div>
  );
}