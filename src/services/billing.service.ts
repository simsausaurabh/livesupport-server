// ─────────────────────────────────────────────
//  LiveSupport — Stripe Billing Service
// ─────────────────────────────────────────────
import Stripe from 'stripe';
import { env } from '../lib/env.js';
import { prisma } from '../lib/prisma.js';
import { Plan } from '../types/index.js';

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

const PRICE_TO_PLAN: Record<string, Plan> = {
  [env.STRIPE_TEAM_PRICE_ID]:     Plan.TEAM,
  [env.STRIPE_BUSINESS_PRICE_ID]: Plan.BUSINESS,
};

const PLAN_LIMITS: Record<Plan, { maxAgents: number; monthlyVisitorLimit: number; chatHistoryMonths: number }> = {
  [Plan.FREE]:     { maxAgents: 1,  monthlyVisitorLimit: 1000, chatHistoryMonths: 6  },
  [Plan.TEAM]:     { maxAgents: 10, monthlyVisitorLimit: 2000, chatHistoryMonths: 8  },
  [Plan.BUSINESS]: { maxAgents: -1, monthlyVisitorLimit: 4000, chatHistoryMonths: 12 },
  [Plan.STARTER]:  {maxAgents: 3,   monthlyVisitorLimit: 5000, chatHistoryMonths: 3. },
};

export async function createCheckoutSession(orgId: string, priceId: string, agentCount: number) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) throw new Error('Org not found');

  let customerId = org.stripeCustomerId ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({ metadata: { orgId } });
    customerId = customer.id;
    await prisma.organization.update({ where: { id: orgId }, data: { stripeCustomerId: customerId } });
  }

  const session = await stripe.checkout.sessions.create({
    customer:   customerId,
    mode:       'subscription',
    line_items: [{ price: priceId, quantity: agentCount }],
    success_url: `${env.WEB_APP_URL}/dashboard/billing?success=1`,
    cancel_url:  `${env.WEB_APP_URL}/dashboard/billing?cancelled=1`,
    metadata: { orgId },
    subscription_data: { metadata: { orgId } },
    allow_promotion_codes: true,
  });

  return session;
}

export async function createPortalSession(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org?.stripeCustomerId) throw new Error('No Stripe customer');

  const session = await stripe.billingPortal.sessions.create({
    customer:   org.stripeCustomerId,
    return_url: `${env.WEB_APP_URL}/dashboard/billing`,
  });
  return session;
}

export async function handleWebhook(payload: Buffer, sig: string) {
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    throw new Error(`Webhook signature failed: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId   = session.metadata?.orgId;
      const subId   = session.subscription as string;
      if (!orgId || !subId) break;

      const sub     = await stripe.subscriptions.retrieve(subId);
      const priceId = sub.items.data[0]?.price.id ?? '';
      const plan    = PRICE_TO_PLAN[priceId] ?? Plan.FREE;
      const limits  = PLAN_LIMITS[plan];

      await prisma.organization.update({
        where: { id: orgId },
        data: {
          plan,
          stripeSubscriptionId: subId,
          ...limits,
        },
      });
      console.log(`✅ Org ${orgId} upgraded to ${plan}`);
      break;
    }

    case 'customer.subscription.updated': {
      const sub     = event.data.object as Stripe.Subscription;
      const orgId   = sub.metadata?.orgId;
      if (!orgId) break;

      const priceId = sub.items.data[0]?.price.id ?? '';
      const plan    = PRICE_TO_PLAN[priceId] ?? Plan.FREE;
      const limits  = PLAN_LIMITS[plan];
      const active  = ['active', 'trialing'].includes(sub.status);

      await prisma.organization.update({
        where: { id: orgId },
        data: { plan: active ? plan : Plan.FREE, ...limits },
      });
      break;
    }

    case 'customer.subscription.deleted': {
      const sub   = event.data.object as Stripe.Subscription;
      const orgId = sub.metadata?.orgId;
      if (!orgId) break;
      await prisma.organization.update({
        where: { id: orgId },
        data: { plan: Plan.FREE, stripeSubscriptionId: null, ...PLAN_LIMITS[Plan.FREE] },
      });
      console.log(`⚠️  Org ${orgId} downgraded to FREE`);
      break;
    }
  }
}

export const billingService = { createCheckoutSession, createPortalSession, handleWebhook };
