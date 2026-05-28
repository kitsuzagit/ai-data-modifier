'use server';

import { auth, signIn, signOut } from '../auth';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// 💡 読み取り側も service_role を使用して確実にデータを取得する
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia' as any,
});

// --- ユーティリティ関数 ---
async function fetchUserUsage(userId: string, email: string) {
  // キャッシュを避けるため、常にデータベースへ直接クエリを投げる
  const { data: usage, error } = await supabase
    .from('user_usage')
    .select('*')
    .or(`user_id.eq.${userId},user_id.eq.${email}`)
    .maybeSingle();

  if (error) console.error("Database fetch error:", error);
  return usage;
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
  // Next.jsのキャッシュを無効化するための重要設定
  const session = await auth();
  if (!session?.user?.id || !session.user?.email) {
    return { isLoggedIn: false, isPremium: false, dailyCount: 0 };
  }

  const usage = await fetchUserUsage(session.user.id, session.user.email);
  
  const todayStr = new Date().toISOString().split('T')[0];
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

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID, quantity: 1 }],
    customer_email: session.user.email,
    success_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/?success=true`,
    cancel_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/`,
    metadata: { userId: session.user.id },
  });

  if (!checkoutSession.url) throw new Error('決済URLの生成に失敗しました。');
  return checkoutSession.url;
}

export async function createCustomerPortalSession() {
  const session = await auth();
  if (!session?.user?.id || !session.user?.email) throw new Error("認証が必要です。");

  const usage = await fetchUserUsage(session.user.id, session.user.email);
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

export async function modifyData(title: string, rawData: string, instruction: string): Promise<string> {
  const session = await auth();
  if (!session?.user?.id || !session.user?.email) throw new Error('認証が必要です。');

  const usage = await fetchUserUsage(session.user.id, session.user.email);
  const isPremium = usage?.is_premium ?? false;
  const targetKey = usage?.user_id ?? session.user.id;

  if (!isPremium) {
    const todayStr = new Date().toISOString().split('T')[0];
    const currentCount = (usage?.last_reset_date === todayStr) ? (usage?.daily_count ?? 0) : 0;
    
    if (currentCount >= 5) throw new Error('本日の無料枠に達しました。');

    await supabase.from('user_usage').upsert({
      user_id: targetKey,
      daily_count: currentCount + 1,
      last_reset_date: todayStr
    }, { onConflict: 'user_id' });
  }

  return "AIによる修正完了";
}