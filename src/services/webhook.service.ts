// Called from socket/routes to fire outgoing webhooks
import { prisma } from '../lib/prisma.js';
import crypto from 'crypto';

export async function dispatchWebhook(
  organizationId: string,
  event: string,
  data: Record<string, any>,
) {
  const webhooks = await prisma.webhook.findMany({
    where: { organizationId, isActive: true },
  });

  const payload = JSON.stringify({ event, timestamp: new Date().toISOString(), organizationId, data });

  await Promise.allSettled(webhooks.map(async (wh) => {
    const events: string[] = JSON.parse(wh.eventsJson);
    if (!events.includes(event)) return;

    const sig = crypto.createHmac('sha256', wh.secret).update(payload).digest('hex');

    try {
      const r = await fetch(wh.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-livesupport-sig': sig },
        body: payload,
        signal: AbortSignal.timeout(8000),
      });

      await prisma.webhookDelivery.create({
        data: { webhookId: wh.id, event, payload, statusCode: r.status, success: r.ok },
      });

      if (!r.ok) {
        await prisma.webhook.update({ where: { id: wh.id }, data: { failureCount: { increment: 1 } } });
      } else {
        await prisma.webhook.update({ where: { id: wh.id }, data: { lastTriggeredAt: new Date(), failureCount: 0 } });
      }
    } catch (err: any) {
      await prisma.webhookDelivery.create({
        data: { webhookId: wh.id, event, payload, success: false, response: err.message },
      });
      await prisma.webhook.update({ where: { id: wh.id }, data: { failureCount: { increment: 1 } } });
    }
  }));
}
