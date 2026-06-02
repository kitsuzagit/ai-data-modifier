# プロジェクト開発ルール & 技術スタック（AI用コンテキスト）

## 1. 技術スタック
- フロントエンド/バックエンド: Next.js (App Router / Server Actions 必須)
- 認証: NextAuth (auth)
- データベース: Supabase (supabase-js)
- 決済: Stripe
- AI機能: Gemini 2.5 Flash API (fetchによる直接呼び出し、JSON Mode強制)

## 2. 厳守すべきアーキテクチャ・セキュリティルール

### 🔒 タイムゾーン問題の回避 (JST固定)
- サーバー（Vercel等）がUTCで動作しているため、日付の取得に `new Date().toISOString()` を直接使用することは禁止。
- 日付文字列（YYYY-MM-DD）を取得する際は、必ず `Intl.DateTimeFormat` を使用して `Asia/Tokyo`（日本時間）を明示的に指定すること。
- プロジェクト共通の `getJstTodayStr()` 関数、またはそれに準ずるJST変換ロジックを必ず挟むこと。

### 🔒 Supabase `service_role` の安全な運用（マルチテナント防御）
- 無料枠のカウントアップなど、ユーザーによるフロントからの不正改ざんを防ぐデリケートな処理には `service_role`（管理者キー）を使用する。
- `service_role` はRLS（行レベルセキュリティ）をバイパスするため、Server Actions 側で以下のバリデーションを**絶対に強制**すること。
  1. `auth()` から取得した `session.user.id` または `email` をベースにクエリを組み立てる。
  2. データベースから取得したレコード（`user_usage`など）の所有者が、ログイン中の本人であるかをガード節（if文）で厳密にチェックする。
  3. データの更新（upsertやupdate）の主キーには、DBから取得した値（`usage?.user_id` など）を使い回さず、認証済みのセッションID（`session.user.id`）を100%強制して割り当てること。