// components/Sidebar.tsx
import Link from 'next/link';
import { getUserHistory, getUserStatus } from '../app/actions';

export async function Sidebar() {
  // 1. ユーザーのログイン状態と、過去の履歴一覧をサーバーサイドで同時に取得
  const status = await getUserStatus();
  const history = await getUserHistory();

  // 2. ログインしていない場合は、シンプルな未ログイン用のバーを表示
  if (!status.isLoggedIn) {
    return (
      <aside className="w-64 h-screen bg-gray-950 text-gray-400 p-4 border-r border-gray-800">
        <div className="text-sm font-bold text-white mb-2">AIデータ加工アプリ</div>
        <p className="text-xs">ログインすると履歴が表示されます。</p>
      </aside>
    );
  }

  return (
    <aside className="w-64 h-screen bg-gray-950 text-gray-200 flex flex-col border-r border-gray-800">
      
      {/* 🏠 上部ヘッダー部分 */}
      <div className="p-4 border-b border-gray-800">
        <Link href="/" className="text-lg font-bold text-white hover:text-emerald-400 transition">
          ✨ AIデータModifier
        </Link>
        <div className="text-xs text-gray-500 mt-1 truncate">{status.userEmail}</div>
      </div>

      {/* ➕ 新規作成（リセット）ボタン */}
      <div className="p-4">
        <Link 
          href="/" 
          className="block w-full text-center bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 px-4 rounded transition text-sm"
        >
          ＋ 新規データ加工
        </Link>
      </div>

      {/* 📜 履歴リスト部分（ここが今回のキモ！） */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        <div className="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          前回の履歴
        </div>
        
        {history.length === 0 ? (
          <div className="text-xs text-gray-500 px-2 py-4">履歴がありません</div>
        ) : (
          history.map((item) => (
            <Link
              key={item.id}
              // 💡 ポイント：URLの末尾に「?history_id=〇〇」を付けてメイン画面に伝える
              href={`/?history_id=${item.id}`} 
              className="block px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-900 hover:text-white transition truncate"
            >
              📄 {item.title || '無題のデータ'}
            </Link>
          ))
        )}
      </div>

      {/* 👑 下部ステータス（無料枠などの表示） */}
      <div className="p-4 border-t border-gray-800 bg-gray-900 text-xs text-gray-400">
        {status.isPremium ? (
          <span className="text-amber-400 font-semibold flex items-center gap-1">
            👑 プレミアムプラン（無制限）
          </span>
        ) : (
          <div className="flex justify-between items-center">
            <span>本日の無料枠:</span>
            <span><strong className="text-white">{status.dailyCount}</strong> / 5 回</span>
          </div>
        )}
      </div>

    </aside>
  );
}