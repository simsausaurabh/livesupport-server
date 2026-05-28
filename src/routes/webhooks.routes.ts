import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission, requirePlanFeature } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/error.js';
import crypto from 'crypto';

export const webhooksRouter = Router();
webhooksRouter.use(requireAuth, requirePlanFeature('webhooks'));

const WEBHOOK_EVENTS = [
  'conversation.created', 'conversation.assigned', 'conversation.resolved',
  'message.created', 'visitor.created', 'agent.status_changed',
] as const;

// GET /api/webhooks
webhooksRouter.get('/', asyncHandler(async (req, res) => {
  const items = await prisma.webhook.findMany({
    where: { organizationId: req.agent!.organizationId },
    include: { deliveries: { orderBy: { createdAt: 'desc' }, take: 5, select: { event: true, success: true, createdAt: true, statusCode: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const parsed = items.map(w => ({ ...w, events: JSON.parse(w.eventsJson) }));
  res.json({ success: true, data: parsed });
}));

// POST /api/webhooks
webhooksRouter.post('/', requirePermission('org:manage_webhooks'), asyncHandler(async (req, res) => {
  const body = z.object({
    url:    z.string().url(),
    events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
  }).parse(req.body);

  const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
  const item   = await prisma.webhook.create({
    data: {
      organizationId: req.agent!.organizationId,
      url: body.url,
      secret,
      eventsJson: JSON.stringify(body.events),
    },
  });
  res.status(201).json({ success: true, data: { ...item, events: body.events, secretOnce: secret } });
}));

// PATCH /api/webhooks/:id
webhooksRouter.patch('/:id', requirePermission('org:manage_webhooks'), asyncHandler(async (req, res) => {
  const body = z.object({
    url:      z.string().url().optional(),
    events:   z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
    isActive: z.boolean().optional(),
  }).parse(req.body);

  const wh = await prisma.webhook.findFirst({ where: { id: req.params['id']!, organizationId: req.agent!.organizationId } });
  if (!wh) throw new AppError(404, 'NOT_FOUND', 'Webhook not found');

  const updated = await prisma.webhook.update({
    where: { id: wh.id },
    data: {
      ...(body.url      && { url: body.url }),
      ...(body.events   && { eventsJson: JSON.stringify(body.events) }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  });
  res.json({ success: true, data: { ...updated, events: JSON.parse(updated.eventsJson) } });
}));

// DELETE /api/webhooks/:id
webhooksRouter.delete('/:id', requirePermission('org:manage_webhooks'), asyncHandler(async (req, res) => {
  const wh = await prisma.webhook.findFirst({ where: { id: req.params['id']!, organizationId: req.agent!.organizationId } });
  if (!wh) throw new AppError(404, 'NOT_FOUND', 'Webhook not found');
  await prisma.webhook.delete({ where: { id: wh.id } });
  res.json({ success: true, data: null });
}));

// POST /api/webhooks/:id/test — send test ping
webhooksRouter.post('/:id/test', requirePermission('org:manage_webhooks'), asyncHandler(async (req, res) => {
  const wh = await prisma.webhook.findFirst({ where: { id: req.params['id']!, organizationId: req.agent!.organizationId } });
  if (!wh) throw new AppError(404, 'NOT_FOUND', 'Webhook not found');

  const payload  = JSON.stringify({ event: 'ping', timestamp: new Date().toISOString(), organizationId: req.agent!.organizationId });
  const sig      = crypto.createHmac('sha256', wh.secret).update(payload).digest('hex');

  try {
    const r = await fetch(wh.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-livesupport-sig': sig },
      body: payload,
      signal: AbortSignal.timeout(10000),
    });
    await prisma.webhookDelivery.create({
      data: { webhookId: wh.id, event: 'ping', payload, statusCode: r.status, success: r.ok },
    });
    res.json({ success: true, data: { statusCode: r.status, ok: r.ok } });
  } catch (err: any) {
    await prisma.webhookDelivery.create({
      data: { webhookId: wh.id, event: 'ping', payload, success: false, response: err.message },
    });
    res.json({ success: true, data: { statusCode: null, ok: false, error: err.message } });
  }
}));

// Export events list for frontend
export const AVAILABLE_WEBHOOK_EVENTS = WEBHOOK_EVENTS;
