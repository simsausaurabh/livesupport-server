import { Router, type Request } from 'express';
import { z } from 'zod';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/error.js';
import { billingService } from '../services/billing.service.js';
import { env } from '../lib/env.js';
import { prisma } from '../lib/prisma.js';

export const billingRouter = Router();

// GET /api/billing/plans — public
billingRouter.get('/plans', (_req, res) => {
  res.json({
    success: true,
    data: {
      plans: [
        {
          id: 'FREE', name: 'Free', price: 0, priceId: null,
          features: ['1 agent', '1,000 visitors/mo', '6 months history', 'Basic analytics'],
          limits: { maxAgents: 1, monthlyVisitors: 1000 },
        },
        {
          id: 'TEAM', name: 'Team', price: 9, priceId: env.STRIPE_TEAM_PRICE_ID,
          features: ['Up to 10 agents', '2,000 visitors/mo', 'AI reply suggestions', 'AI chat summary', 'Custom logo', 'Canned responses', 'Agent ratings'],
          limits: { maxAgents: 10, monthlyVisitors: 2000 },
          popular: true,
        },
        {
          id: 'BUSINESS', name: 'Business', price: 29, priceId: env.STRIPE_BUSINESS_PRICE_ID,
          features: ['Unlimited agents', '4,000+ visitors/mo', 'AI chatbot', 'Custom AI persona', 'Webhooks', 'REST API access', 'Advanced analytics', 'SLA agreement', 'Key account manager'],
          limits: { maxAgents: -1, monthlyVisitors: 4000 },
        },
      ],
    },
  });
});

// GET /api/billing/subscription — current sub info
billingRouter.get('/subscription', requireAuth, asyncHandler(async (req, res) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.agent!.organizationId },
    select: { plan: true, stripeSubscriptionId: true, stripeCustomerId: true, trialEndsAt: true, monthlyVisitorLimit: true, currentMonthVisitors: true, maxAgents: true },
  });
  if (!org) throw new AppError(404, 'NOT_FOUND', 'Org not found');
  res.json({ success: true, data: org });
}));

// POST /api/billing/checkout — create Stripe Checkout session
billingRouter.post('/checkout', requireAuth, requirePermission('org:manage_billing'), asyncHandler(async (req, res) => {
  const { priceId, agentCount } = z.object({ priceId: z.string(), agentCount: z.number().int().min(1).default(1) }).parse(req.body);
  const session = await billingService.createCheckoutSession(req.agent!.organizationId, priceId, agentCount);
  res.json({ success: true, data: { url: session.url } });
}));

// POST /api/billing/portal — Stripe customer portal
billingRouter.post('/portal', requireAuth, requirePermission('org:manage_billing'), asyncHandler(async (req, res) => {
  const session = await billingService.createPortalSession(req.agent!.organizationId);
  res.json({ success: true, data: { url: session.url } });
}));

// POST /api/billing/webhook — Stripe webhook (raw body needed)
billingRouter.post('/webhook',
  // express.raw is applied in index.ts for this route
  asyncHandler(async (req: Request, res) => {
    const sig = req.headers['stripe-signature'] as string;
    if (!sig) throw new AppError(400, 'MISSING_SIG', 'Missing stripe-signature header');
    await billingService.handleWebhook(req.body as Buffer, sig);
    res.json({ received: true });
  })
);
