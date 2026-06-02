import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// 🔒 特権操作用：ユーザーの身代わりではなく、サーバーシステムとして書き換えるため service_role を使用
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia' as any,
});

// ⚠️ Stripeからの生のバイナリ（Raw Body）を検証に使うため、Edge RuntimeではなくNode.js環境で動かす
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.text(); // 💡 署名検証には、JSONパースする前の生のテキスト文字列が必要
  const signature = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    console.error('[Webhook Error] Missing stripe-signature or STRIPE_WEBHOOK_SECRET');
    return new NextResponse('Webhook configuration error', { status: 400 });
  }

  let event: Stripe.Event;

  try {
    // 🔒 リクエストが本当にStripeから送られたものか厳密に検証
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error(`[Webhook Error] Signature verification failed: ${err.message}`);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  console.log(`[Webhook] Received event type: ${event.type}`);

  // 💎 処理対象とするイベントの絞り込み
  // 1. 初回サブスク購入成功時: checkout.session.completed
  // 2. 2回目以降の自動更新成功時 / 未払いからの復活時: invoice.payment_succeeded
  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      
      // actions.ts で仕込んだ metadata.userId を取得
      const userId = session.metadata?.userId;
      const customerId = session.customer as string;

      if (!userId) {
        console.error('[Webhook Error] No userId found in session metadata');
        return new NextResponse('Missing userId in metadata', { status: 400 });
      }

      console.log(`[Webhook] Upgrading user ${userId} to Premium (Customer: ${customerId})`);

      // 🔒 Supabaseのフラグ更新
      // まだ user_usage レコードがない場合も考慮して upsert にする
      const { error } = await supabase.from('user_usage').upsert(
        {
          user_id: userId,
          is_premium: true,
          stripe_customer_id: customerId, // 今後ポータル画面を開くために必須
        },
        { onConflict: 'user_id' }
      );

      if (error) {
        console.error('[Supabase Webhook Error]:', error);
        throw error;
      }
    }

    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;

      // 初回ではない更新の場合、metadataにuserIdがいないことがあるため、
      // stripe_customer_id をキーにしてSupabaseから対象ユーザーを探して更新する
      if (customerId) {
        const { error } = await supabase
          .from('user_usage')
          .update({ is_premium: true })
          .eq('stripe_customer_id', customerId);

        if (error) {
          console.error('[Supabase Invoice Webhook Error]:', error);
          throw error;
        }
      }
    }

    // 💡 解約や未払いによるステータス失効（is_premium: false）もケアしたい場合は、
    // `customer.subscription.deleted` や `invoice.payment_failed` イベントもここに追記していきます。

    return new NextResponse(JSON.stringify({ received: true }), { status: 200 });

  } catch (error: any) {
    console.error(`[Webhook Error] Internal handler failed: ${error.message}`);
    return new NextResponse('Webhook handler failed', { status: 500 });
  }
}