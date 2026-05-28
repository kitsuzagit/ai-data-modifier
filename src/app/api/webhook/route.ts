import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia' as any,
});

// サービスロールクライアントの初期化
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return new NextResponse('Missing stripe-signature header', { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error(`❌ Webhook署名検証失敗:`, err.message);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  try {
    // 💡 修正ポイント: .from('user_usage') を各ケースの最初で確実に呼び出す
    const db = supabase.schema('public').from('user_usage');

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const customerId = session.customer as string;

        if (userId) {
          const { error: idError } = await db.upsert({
            user_id: userId,
            is_premium: true,
            stripe_customer_id: customerId,
            last_reset_date: new Date().toISOString().split('T')[0],
            daily_count: 0,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });
            
          if (idError) throw idError;
          console.log(`✅ Webhook: ユーザー ${userId} をプレミアムに更新しました`);
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const isPremium = event.type === 'customer.subscription.updated' 
          ? (sub.status === 'active' || sub.status === 'trialing') 
          : false;

        const { error } = await db
          .update({ is_premium: isPremium, updated_at: new Date().toISOString() })
          .eq('stripe_customer_id', sub.customer as string);
          
        if (error) throw error;
        console.log(`✅ Webhook: サブスク更新/解約処理完了`);
        break;
      }
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('❌ Webhook処理エラー:', error);
    return new NextResponse('Webhook processing failed', { status: 500 });
  }
}