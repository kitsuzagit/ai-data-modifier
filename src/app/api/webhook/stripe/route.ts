import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia' as any,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: Request) {
  const body = await req.text();
  const sig = (await headers()).get('stripe-signature')!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  // 📦 イベント処理
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const customerId = session.customer as string;

      if (userId) {
        // プレミアムフラグをONにし、Stripeの顧客IDを保存
        await supabase
          .from('user_usage')
          .upsert({
            user_id: userId,
            is_premium: true,
            stripe_customer_id: customerId,
          }, { onConflict: 'user_id' });
      }
      break;

    case 'customer.subscription.deleted':
      const sub = event.data.object as Stripe.Subscription;
      const customerIdDeleted = sub.customer as string;

      // 解約時にプレミアムフラグをOFFにする
      await supabase
        .from('user_usage')
        .update({ is_premium: false })
        .eq('stripe_customer_id', customerIdDeleted);
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  return NextResponse.json({ received: true });
}