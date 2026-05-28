import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getIO }  from '../socket/io.js';
import { SocketRooms } from '../types';
import { requireAuth, requirePermission, requirePlanFeature } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/error.js';
import { conversationService } from '../services/conversation.service.js';
import { aiService } from '../services/ai.service.js';
import { MessageSenderType, hasPermission } from '../types';

export const conversationsRouter = Router();
conversationsRouter.use(requireAuth);

// GET /api/conversations
conversationsRouter.get('/', requirePermission('conversations:view'), asyncHandler(async (req, res) => {
  const q = z.object({
    status:          z.string().optional(),
    assignedAgentId: z.string().optional(),
    page:            z.coerce.number().min(1).default(1),
    pageSize:        z.coerce.number().min(1).max(100).default(20),
    search:          z.string().optional(),
  }).parse(req.query);
  const result = await conversationService.getConversations(req.agent!.organizationId, q);
  res.json({ success: true, data: result });
}));

// GET /api/conversations/:id
conversationsRouter.get('/:id', requirePermission('conversations:view'), asyncHandler(async (req, res) => {
  const conv = await conversationService.getConversationById(req.params['id']!, req.agent!.organizationId);
  if (!conv) throw new AppError(404, 'NOT_FOUND', 'Conversation not found');
  res.json({ success: true, data: conv });
}));

// POST /api/conversations/:id/messages
conversationsRouter.post('/:id/messages', requirePermission('messages:send'), asyncHandler(async (req, res) => {
  const body = z.object({
    content:        z.string().min(1).max(10000),
    isInternalNote: z.boolean().default(false),
    isAiSuggested:  z.boolean().default(false),
  }).parse(req.body);

  if (body.isInternalNote && !hasPermission(req.agent!.role, 'messages:send_internal_note')) {
    throw new AppError(403, 'FORBIDDEN', 'Cannot send internal notes');
  }

  const conv = await prisma.conversation.findFirst({ where: { id: req.params['id']!, organizationId: req.agent!.organizationId } });
  if (!conv) throw new AppError(404, 'NOT_FOUND', 'Conversation not found');
  if (conv.status === 'RESOLVED' && !body.isInternalNote) {
    throw new AppError(403, 'CONVERSATION_RESOLVED', 'Cannot send messages to a resolved conversation.');
  }

  const message = await conversationService.addMessage({
    conversationId: req.params['id']!,
    organizationId: req.agent!.organizationId,
    senderType:     MessageSenderType.AGENT,
    senderId:       req.agent!.id,
    content:        body.content,
    isInternalNote: body.isInternalNote,
    isAiSuggested:  body.isAiSuggested,
  });
  // Broadcast to conversation room (widget) and org room (other agents)
  const io = getIO();
  if (io) {
    io.to(SocketRooms.conversation(req.params['id']!)).emit('message:new', message as any);
    if (!body.isInternalNote) {
      io.to(SocketRooms.org(req.agent!.organizationId)).emit('message:new', message as any);
    }
  }

  res.status(201).json({ success: true, data: message });
}));

// GET /api/conversations/:id/suggestions
conversationsRouter.get('/:id/suggestions',
  requirePermission('conversations:reply'),
  requirePlanFeature('aiReplySuggestions'),
  asyncHandler(async (req, res) => {
    const conv = await prisma.conversation.findFirst({
      where: { id: req.params['id']!, organizationId: req.agent!.organizationId },
      include: {
        messages:     { where: { isInternalNote: false }, orderBy: { createdAt: 'asc' }, take: 15 },
        organization: { select: { name: true } },
      },
    });
    if (!conv) throw new AppError(404, 'NOT_FOUND', 'Conversation not found');
    const suggestions = await aiService.generateReplySuggestions(conv.messages as any, req.agent!.name, conv.organization.name);
    res.json({ success: true, data: { suggestions, conversationId: req.params['id']! } });
  })
);

// POST /api/conversations/:id/assign
conversationsRouter.post('/:id/assign', requirePermission('conversations:assign'), asyncHandler(async (req, res) => {
  const { agentId } = z.object({ agentId: z.string() }).parse(req.body);
  const target = await prisma.agent.findFirst({ where: { id: agentId, organizationId: req.agent!.organizationId } });
  if (!target) throw new AppError(404, 'NOT_FOUND', 'Agent not found');
  const updated = await prisma.conversation.update({
    where: { id: req.params['id']! },
    data:  { assignedAgentId: agentId, status: 'ASSIGNED' },
    include: { assignedAgent: { select: { id: true, name: true, avatarUrl: true, status: true } } },
  });
  res.json({ success: true, data: updated });
}));

// POST /api/conversations/:id/resolve
conversationsRouter.post('/:id/resolve', requirePermission('conversations:resolve'), asyncHandler(async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { id: req.agent!.organizationId }, select: { plan: true } });
  const resolved = await conversationService.resolveConversation(req.params['id']!, req.agent!.organizationId, org?.plan ?? 'FREE');

  // Notify the widget (visitor) and all agents in the org that the chat is resolved
  const io = getIO();
  if (io) {
    const payload = { conversationId: req.params['id']!, id: req.params['id']!, status: 'RESOLVED', resolvedAt: resolved.resolvedAt };
    io.to(SocketRooms.conversation(req.params['id']!)).emit('conversation:resolved', payload as any);
    io.to(SocketRooms.org(req.agent!.organizationId)).emit('conversation:resolved', payload as any);
  }

  res.json({ success: true, data: resolved });
}));

// DELETE /api/conversations/:id
conversationsRouter.delete('/:id', requirePermission('conversations:delete'), asyncHandler(async (req, res) => {
  await prisma.conversation.delete({ where: { id: req.params['id']! } as any });
  res.json({ success: true, data: null });
}));

// POST /api/conversations/:id/handoff  (bot -> human)
conversationsRouter.post('/:id/handoff', requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const { performHandoff } = await import('../services/chatbot.service.js');
  const result = await performHandoff(id!, req.agent!.organizationId, reason);
  res.json({ success: true, data: result });
}));
