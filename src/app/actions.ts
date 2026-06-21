'use server';

import { auth, signIn, signOut } from '../auth';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// 環境変数の存在チェック（存在しない場合はエラー）
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase environment variables');
}
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing Stripe secret key');
}
if (!process.env.GEMINI_API_KEY) {
  throw new Error('Missing Gemini API key');
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-04-22.dahlia' as any,
});

// --- ユーティリティ関数 ---

async function fetchUserUsage(userId: string) {
  // 🔒 主キーである本人セッションID（session.user.id）で厳密に1件だけを取得
  const { data: usage, error } = await supabase
    .from('user_usage')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) console.error("Database fetch error:", error);
  return usage;
}

function getJstTodayStr(): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date()).replace(/\//g, '-');
}

// --- 公開関数 ---

export async function getSession() {
  return await auth();
}

export async function loginWithGoogle() {
  await signIn('google', { redirectTo: '/' });
}

export async function logout() {
  await signOut({ redirectTo: '/' });
}

export async function getUserStatus() {
  const session = await auth();
  if (!session?.user?.id || !session.user?.email) {
    return { isLoggedIn: false, isPremium: false, dailyCount: 0 };
  }

  const usage = await fetchUserUsage(session.user.id);

  // 🔒 セキュリティガード節: 取得データの user_id 整合性チェック
  if (usage && usage.user_id !== session.user.id) {
    console.error(`[SECURITY ALERT] Unauthorized data access attempt by user: ${session.user.id}`);
    return { isLoggedIn: false, isPremium: false, dailyCount: 0 };
  }

  const todayStr = getJstTodayStr();
  const isPremium = usage?.is_premium ?? false;
  const dailyCount = (usage?.last_reset_date === todayStr) ? (usage?.daily_count ?? 0) : 0;

  return {
    isLoggedIn: true,
    userEmail: session.user.email,
    isPremium,
    dailyCount
  };
}

export async function createCheckoutSession(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id || !session.user?.email) throw new Error('ログインが必要です。');
  if (!process.env.NEXT_PUBLIC_STRIPE_PRICE_ID) throw new Error('Stripe Price IDが設定されていません。');

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID, quantity: 1 }],
    customer_email: session.user.email,
    success_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/?success=true`,
    cancel_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/`,
    metadata: { userId: session.user.id }, // Webhook側で受け取る重要メタデータ
  });

  if (!checkoutSession.url) throw new Error('決済URLの生成に失敗しました。');
  return checkoutSession.url;
}

export async function createCustomerPortalSession() {
  const session = await auth();
  if (!session?.user?.id || !session.user?.email) throw new Error("認証が必要です。");

  const usage = await fetchUserUsage(session.user.id);
  
  if (usage && usage.user_id !== session.user.id) {
    throw new Error('不正なアクセスです。');
  }

  if (!usage?.stripe_customer_id) return { url: null };

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: usage.stripe_customer_id,
      return_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/`,
    });
    return { url: portalSession.url };
  } catch (error) {
    console.error("Portal Session Error:", error);
    return { url: null };
  }
}

// 🆕 【追記】履歴一覧を取得する関数（サイドバー表示用）
export async function getUserHistory() {
  const session = await auth();
  if (!session?.user?.id) return [];

  const { data, error } = await supabase
    .from('modification_histories')
    .select('id, title, created_at')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Fetch history error:", error);
    return [];
  }
  return data;
}

// 🆕 【追記】特定の履歴の詳細を取得する関数（見返し用）
export async function getHistoryDetail(historyId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('認証が必要です。');

  const { data, error } = await supabase
    .from('modification_histories')
    .select('*')
    .eq('id', historyId)
    .maybeSingle();

  if (error || !data) return null;
  if (data.user_id !== session.user.id) throw new Error('不正なアクセスです。');

  return data;
}

export async function modifyData(title: string, rawData: string, instruction: string): Promise<string> {
  const session = await auth();
  if (!session?.user?.id || !session.user?.email) throw new Error('認証が必要です。');

  const usage = await fetchUserUsage(session.user.id);
  
  if (usage && usage.user_id !== session.user.id) {
    throw new Error('不正なアクセスが検出されました。');
  }

  const isPremium = usage?.is_premium ?? false;
  const targetKey = session.user.id; // 🔒 100%認証セッションIDを強制
  const todayStr = getJstTodayStr();

  // 1. 【事前チェック】無料ユーザーの上限を確認
  if (!isPremium) {
    const currentCount = (usage?.last_reset_date === todayStr) ? (usage?.daily_count ?? 0) : 0;
    if (currentCount >= 5) throw new Error('本日の無料枠に達しました。');
  }

  const isImage = rawData.startsWith('data:image/');
  let contents: any[] = [];

  if (isImage) {
    const matches = rawData.match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) throw new Error('画像のデータ形式が不正です。');
    
    const mimeType = matches[1];
    const base64Data = matches[2];

    contents = [{
      parts: [
        {
          text: `あなたは優秀なデータ入力・OCR・加工アシスタントです。
添付された画像データ（ファイル名: "${title}"）から情報を読み取り、以下の「修正指示」に従ってデータを抽出・修正・加工してください。

【修正指示】
${instruction}

【出力ルール】
必ず指定されたJSONフォーマットのみで返却してください。マークダウンの装飾（\`\`\`jsonなど）や解説テキストは一切含めないでください。
「modifiedData」に含める成果物は、指示がない限り、ユーザーが扱いやすいプレーンテキストやMarkdownの表、JSON文字列などに整形してください。`
        },
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        }
      ]
    }];
  } else {
    const prompt = `あなたは優秀なデータ入力・データ加工アシスタントです。
対象データ（タイトル: "${title}"）に対して、以下の「修正指示」に従って表記揺れの修正、誤入力を自動修正、またはデータ加工を行ってください。

【修正指示】
${instruction}

【対象データ】
${rawData}

【出力ルール】
必ず指定されたJSONフォーマットのみで返却してください。マークダウンの装飾（\`\`\`jsonなど）や解説テキストは一切含めないでください。
「modifiedData」に含めるデータ形式（CSVのJSON文字列、プレーンテキストなど）は、元のデータの構造を崩さないように維持してください。`;

    contents = [{ parts: [{ text: prompt }] }];
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: contents,
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                modifiedData: { 
                  type: 'STRING', 
                  description: '修正・加工・抽出が完了した後のデータ。元の構造（JSON/CSV/テキスト）を極力維持すること。' 
                },
                suggestedPrompts: {
                  type: 'ARRAY',
                  description: 'このデータや結果に対して、ユーザーが次に指示すると良さそうな「おすすめの追加指示」を3つ提案してください。',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      label: { type: 'STRING', description: '指示の短い要約ラベル（例: "重複を削除する", "日付をYYYY/MM/DDに統一"）' },
                      text: { type: 'STRING', description: '具体的な指示文のテキスト（そのままAIへの指示に入力されます）' }
                    },
                    required: ['label', 'text']
                  }
                }
              },
              required: ['modifiedData', 'suggestedPrompts']
            }
          }
        })
      }
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error('Gemini API Error:', errData);
      throw new Error('AIモデルの呼び出しに失敗しました。');
    }

    const resJson = await response.json();
    const resText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!resText) {
      throw new Error('AIから有効なデータが返却されませんでした。');
    }

    // 🛠️ 【修正・追記箇所】AIの返答取得に成功したら、新設した履歴テーブルに自動保存
    const { error: historyError } = await supabase
      .from('modification_histories')
      .insert({
        user_id: targetKey,
        title: title,
        instruction: instruction,
        modified_data: resText // AIから返ってきたJSON文字列をそのまま保存
      });
    
    if (historyError) {
      console.error('Failed to save history to Supabase:', historyError);
    }

    // 2. 【カウント消費】AIのデータ取得が完全に成功した「後」にインクリメント
    if (!isPremium) {
      // 呼び出し中のカウント変動を考慮し、再度最新の利用状況をベースに安全にupsert
      const latestUsage = await fetchUserUsage(targetKey);
      const currentCount = (latestUsage?.last_reset_date === todayStr) ? (latestUsage?.daily_count ?? 0) : 0;

      await supabase.from('user_usage').upsert({
        user_id: targetKey,
        daily_count: currentCount + 1,
        last_reset_date: todayStr
      }, { onConflict: 'user_id' });
    }

    return resText;
  } catch (error: any) {
    console.error('modifyData Execution Error:', error);
    throw new Error(error.message || 'データ修正処理中に予期せぬエラーが発生しました。');
  }
}