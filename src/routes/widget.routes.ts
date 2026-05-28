import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, AppError } from '../middleware/error.js';
import { conversationService } from '../services/conversation.service.js';
import { getBotReply, performHandoff } from '../services/chatbot.service.js';
import { getIO }   from '../socket/io.js';
import { SocketRooms } from '../types';
import { MessageSenderType } from '../types';
import { redis, CacheKeys, TTL } from '../lib/redis.js';

export const widgetRouter = Router();

const widgetRateLimit = rateLimit({ windowMs: 60_000, max: 60 });
widgetRouter.use(widgetRateLimit);

// Validate widget key on every request
async function validateWidgetKey(req: any, res: any, next: any) {
  const widgetKey = req.headers['x-widget-key'] as string;
  if (!widgetKey) { res.status(401).json({ success: false, error: { code: 'MISSING_KEY', message: 'Widget key required' } }); return; }

  const cached = await redis.get(CacheKeys.widgetConfig(widgetKey)).catch(() => null);
  if (cached) { req.widgetOrg = JSON.parse(cached); return next(); }

  const org = await prisma.organization.findUnique({
    where: { widgetKey },
    select: { id: true, plan: true, name: true, widgetSettingsJson: true, monthlyVisitorLimit: true, currentMonthVisitors: true },
  });
  if (!org) { res.status(401).json({ success: false, error: { code: 'INVALID_KEY', message: 'Invalid widget key' } }); return; }

  if (redis) {
    await redis?.setex(
      CacheKeys.widgetConfig(widgetKey),
      TTL.widgetConfig,
      JSON.stringify(org)
    ).catch(() => null);
  }
  req.widgetOrg = org;
  next();
}

// POST /api/widget/init
widgetRouter.post('/init', validateWidgetKey, asyncHandler(async (req, res) => {
  const body = z.object({
    visitorFingerprint: z.string().min(1).max(200),
    visitorData: z.object({
      email:      z.string().email().optional(),
      name:       z.string().max(100).optional(),
      customData: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
    }).optional(),
    pageData: z.object({
      url:      z.string().url(),
      title:    z.string().max(200).optional(),
      referrer: z.string().optional(),
    }),
  }).parse(req.body);

  const org = req.widgetOrg;

  if (org.currentMonthVisitors >= org.monthlyVisitorLimit) {
    res.json({ success: true, data: { blocked: true, reason: 'VISITOR_LIMIT_REACHED' } });
    return;
  }

  const visitor = await prisma.visitor.upsert({
    where: { organizationId_fingerprint: { organizationId: org.id, fingerprint: body.visitorFingerprint } },
    update: {
      currentUrl: body.pageData.url,
      referrer:   body.pageData.referrer,
      lastSeenAt: new Date(),
      ...(body.visitorData?.email      && { email: body.visitorData.email }),
      ...(body.visitorData?.name       && { name: body.visitorData.name }),
      ...(body.visitorData?.customData && { customDataJson: JSON.stringify(body.visitorData.customData) }),
    },
    create: {
      organizationId: org.id,
      fingerprint:    body.visitorFingerprint,
      email:          body.visitorData?.email,
      name:           body.visitorData?.name,
      currentUrl:     body.pageData.url,
      referrer:       body.pageData.referrer,
      ipAddress:      req.ip ?? null,
      customDataJson: JSON.stringify(body.visitorData?.customData ?? {}),
    },
  });

  await prisma.organization.update({ where: { id: org.id }, data: { currentMonthVisitors: { increment: 1 } } });

  const onlineAgents = await prisma.agent.findMany({
    where:  { organizationId: org.id, status: 'ONLINE', isActive: true },
    select: { id: true, name: true, avatarUrl: true, status: true },
  });

  const existing = await prisma.conversation.findFirst({
    where: { organizationId: org.id, visitorId: visitor.id, status: { in: ['OPEN', 'ASSIGNED'] } },
    orderBy: { createdAt: 'desc' }, select: { id: true },
  });

  res.json({
    success: true,
    data: {
      visitorId:              visitor.id,
      widgetSettings:         JSON.parse(org.widgetSettingsJson || '{}'),
      onlineAgents,
      previousConversationId: existing?.id ?? null,
    },
  });
}));

// POST /api/widget/conversations
widgetRouter.post('/conversations', validateWidgetKey, asyncHandler(async (req, res) => {
  const { visitorId, email } = z.object({ visitorId: z.string(), email: z.string().email().optional() }).parse(req.body);

  // Find active chatbot for this org
  const activeChatbot = await prisma.chatbot.findFirst({
    where: { organizationId: req.widgetOrg.id!, status: 'ACTIVE' },
    select: { id: true, welcomeMessage: true },
  });

  const conv = await conversationService.createConversation({
    organizationId: req.widgetOrg.id!,
    visitorId,
    chatbotId: activeChatbot?.id,
  });

  // Send bot welcome message if chatbot is active
  if (activeChatbot) {
    await conversationService.addMessage({
      conversationId: conv.id,
      organizationId: req.widgetOrg.id!,
      senderType: MessageSenderType.BOT,
      content: activeChatbot.welcomeMessage,
    });
  }

  res.status(201).json({ success: true, data: { conversationId: conv.id, hasChatbot: !!activeChatbot } });
}));

// POST /api/widget/conversations/:id/messages
widgetRouter.post('/conversations/:id/messages', validateWidgetKey, asyncHandler(async (req, res) => {
  const { content } = z.object({ content: z.string().min(1).max(5000) }).parse(req.body);
  const convId = req.params['id']!;

  const conv = await prisma.conversation.findFirst({
    where: { id: convId, organizationId: req.widgetOrg.id! },
    include: {
      messages: { orderBy: { createdAt: 'asc' }, take: 20, select: { senderType: true, content: true } },
    },
  });
  if (!conv) throw new AppError(404, 'NOT_FOUND', 'Conversation not found');
  if (conv.status === 'RESOLVED') {
    throw new AppError(403, 'CONVERSATION_RESOLVED', 'This conversation has been resolved. Please start a new chat.');
  }

  // Store visitor message
  const message = await conversationService.addMessage({
    conversationId: convId, organizationId: req.widgetOrg.id!,
    senderType: MessageSenderType.VISITOR, content,
  });

  // Broadcast visitor message to agent dashboard in real-time
  const io = getIO();
  if (io) {
    io.to(SocketRooms.conversation(convId)).emit('message:new', message as any);
    io.to(SocketRooms.org(req.widgetOrg.id!)).emit('message:new', message as any);
  }

  // Trigger bot reply if chatbot is handling this conversation
  if (conv.chatbotId && !conv.botHandedOff) {
    const history = conv.messages.map(m => ({
      role: (m.senderType === 'VISITOR' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    }));

    // Fire-and-forget so visitor gets instant HTTP response
    getBotReply(conv.chatbotId, history, content)
      .then(async ({ reply, shouldHandoff }) => {
        const ioInst = getIO();
        if (shouldHandoff) {
          if (reply) {
            const botMsg = await conversationService.addMessage({
              conversationId: convId, organizationId: req.widgetOrg.id!,
              senderType: 'BOT' as any, content: reply,
            });
            if (ioInst) {
              ioInst.to(SocketRooms.conversation(convId)).emit('message:new', botMsg as any);
              ioInst.to(SocketRooms.org(req.widgetOrg.id!)).emit('message:new', botMsg as any);
            }
          }
          await performHandoff(convId, req.widgetOrg.id!);
          if (ioInst) {
            ioInst.to(SocketRooms.conversation(convId)).emit('conversation:updated', { id: convId, botHandedOff: true, status: 'ASSIGNED' } as any);
            ioInst.to(SocketRooms.org(req.widgetOrg.id!)).emit('conversation:updated', { id: convId, botHandedOff: true, status: 'ASSIGNED' } as any);
          }
        } else if (reply) {
          const botMsg = await conversationService.addMessage({
            conversationId: convId, organizationId: req.widgetOrg.id!,
            senderType: 'BOT' as any, content: reply,
          });
          if (ioInst) {
            ioInst.to(SocketRooms.conversation(convId)).emit('message:new', botMsg as any);
            ioInst.to(SocketRooms.org(req.widgetOrg.id!)).emit('message:new', botMsg as any);
          }
        }
      })
      .catch(console.error);
  }

  res.status(201).json({ success: true, data: message });
}));

// POST /api/widget/conversations/:id/handoff
widgetRouter.post('/conversations/:id/handoff', validateWidgetKey, asyncHandler(async (req, res) => {
  const { reason } = z.object({ reason: z.string().max(300).optional() }).parse(req.body);
  const result = await performHandoff(req.params['id']!, req.widgetOrg.id!, reason);
  res.json({ success: true, data: result });
}));

// POST /api/widget/conversations/:id/rate
widgetRouter.post('/conversations/:id/rate', validateWidgetKey, asyncHandler(async (req, res) => {
  const body = z.object({ score: z.number().int().min(1).max(5), comment: z.string().max(500).optional() }).parse(req.body);

  const updated = await prisma.conversation.update({
    where: { id: req.params['id']! },
    data:  { rating: body.score, ratingComment: body.comment },
  });

  if (updated.assignedAgentId) {
    await prisma.agentRating.upsert({
      where:  { conversationId: req.params['id']! },
      update: { score: body.score, comment: body.comment },
      create: { conversationId: req.params['id']!, agentId: updated.assignedAgentId, organizationId: req.widgetOrg.id!, score: body.score, comment: body.comment },
    });

    const ratings = await prisma.agentRating.findMany({ where: { agentId: updated.assignedAgentId }, select: { score: true } });
    const avg     = ratings.reduce((s, r) => s + r.score, 0) / ratings.length;
    await prisma.agent.update({ where: { id: updated.assignedAgentId }, data: { ratingAvg: Math.round(avg * 10) / 10, ratingCount: ratings.length } });
  }

  res.json({ success: true, data: null });
}));
