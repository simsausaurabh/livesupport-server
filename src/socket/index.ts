import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { prisma } from '../lib/prisma.js';
import {
  MessageSenderType, AgentStatus, SocketRooms,
  Plan, canUseFeature,
} from '../types';
import type { ClientToServerEvents, ServerToClientEvents } from '../types';
import { verifyToken } from '../lib/jwt.js';
import { redis, CacheKeys, TTL } from '../lib/redis.js';
import { conversationService } from '../services/conversation.service.js';
import { aiService } from '../services/ai.service.js';
import { getBotReply, performHandoff } from '../services/chatbot.service.js';
import { env } from '../lib/env.js';
import { setIO } from './io.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

export function initSocketServer(httpServer: HttpServer): IO {
  const io = new Server(httpServer, {
    cors: {
      origin:      [env.WEB_APP_URL, env.WIDGET_CDN_URL],
      credentials: true,
    },
    transports:    ['websocket', 'polling'],
    pingTimeout:   60000,
    pingInterval:  25000,
  });

  // ── Auth middleware ───────────────────────────
  io.use(async (socket, next) => {
    const token     = socket.handshake.auth['token']     as string | undefined;
    const widgetKey = socket.handshake.auth['widgetKey'] as string | undefined;

    if (widgetKey) {
      const org = await prisma.organization.findUnique({
        where: { widgetKey }, select: { id: true, plan: true },
      });
      if (!org) return next(new Error('Invalid widget key'));
      socket.data['organizationId'] = org.id;
      socket.data['plan']           = org.plan;
      socket.data['isWidget']       = true;
      return next();
    }

    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = await verifyToken(token);
      const agent   = await prisma.agent.findFirst({
        where: { id: payload.agentId, isActive: true },
        select: { id: true, organizationId: true, name: true, role: true },
      });
      if (!agent) return next(new Error('Agent not found'));
      socket.data['agentId']        = agent.id;
      socket.data['organizationId'] = agent.organizationId;
      socket.data['agentName']      = agent.name;
      socket.data['role']           = agent.role;
      socket.data['isWidget']       = false;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  setIO(io);

  io.on('connection', async (socket) => {
    const isWidget = socket.data['isWidget'] as boolean;
    const orgId    = socket.data['organizationId'] as string;
    if (isWidget) await handleWidget(socket, io, orgId);
    else          await handleAgent(socket, io, orgId);
  });

  return io;
}

// ─────────────────────────────────────────────
//  Widget connection
// ─────────────────────────────────────────────
async function handleWidget(socket: any, io: IO, orgId: string) {
  const visitorId = socket.handshake.auth['visitorId'] as string | undefined;
  if (visitorId) await socket.join(SocketRooms.visitor(visitorId));

  // Support both event names (widget.ts sends 'visitor:join')
  const joinHandler = async ({ conversationId, visitorId: vid }: { conversationId: string; visitorId?: string }) => {
    await socket.join(SocketRooms.conversation(conversationId));
    if (vid) await socket.join(SocketRooms.visitor(vid));
    io.to(SocketRooms.org(orgId)).emit('conversation:updated', { id: conversationId, updatedAt: new Date() } as any);
  };
  socket.on('visitor:join', joinHandler);
  socket.on('widget:join', ({ conversationId, visitorId: vid }: { conversationId: string; visitorId?: string }) => {
    joinHandler({ conversationId, visitorId: vid });
  });

  socket.on('widget:message', async ({ conversationId, content }: { conversationId: string; content: string }) => {
    try {
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, organizationId: orgId },
        include: { organization: { select: { plan: true, name: true, widgetSettingsJson: true } } },
      });
      if (!conversation) return;

      // Block messages on resolved conversations — tell the visitor to start a new chat
      if (conversation.status === 'RESOLVED') {
        socket.emit('conversation:resolved', { conversationId, id: conversationId, status: 'RESOLVED' });
        return;
      }

      const message = await conversationService.addMessage({
        conversationId, organizationId: orgId, senderType: MessageSenderType.VISITOR, content,
      });

      io.to(SocketRooms.conversation(conversationId)).emit('message:new', message as any);
      io.to(SocketRooms.org(orgId)).emit('message:new', message as any);

      // ── Chatbot reply (if conversation is handled by an active bot) ──
      if (conversation.chatbotId && !conversation.botHandedOff) {
        const history = await prisma.message.findMany({
          where: { conversationId }, orderBy: { createdAt: 'asc' }, take: 20,
          select: { senderType: true, content: true },
        });
        const chatHistory = history.map(m => ({
          role: (m.senderType === 'VISITOR' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.content,
        }));

        getBotReply(conversation.chatbotId, chatHistory, content)
          .then(async ({ reply, shouldHandoff }) => {
            if (shouldHandoff) {
              if (reply) {
                const botMsg = await conversationService.addMessage({ conversationId, organizationId: orgId, senderType: MessageSenderType.BOT, content: reply });
                io.to(SocketRooms.conversation(conversationId)).emit('message:new', botMsg as any);
                io.to(SocketRooms.org(orgId)).emit('message:new', botMsg as any);
              }
              await performHandoff(conversationId, orgId);
              io.to(SocketRooms.conversation(conversationId)).emit('conversation:updated', { id: conversationId, botHandedOff: true, status: 'ASSIGNED' } as any);
              io.to(SocketRooms.org(orgId)).emit('conversation:updated', { id: conversationId, botHandedOff: true, status: 'ASSIGNED' } as any);
            }
            if (!shouldHandoff && reply) {
              const botMsg = await conversationService.addMessage({ conversationId, organizationId: orgId, senderType: MessageSenderType.BOT, content: reply });
              io.to(SocketRooms.conversation(conversationId)).emit('message:new', botMsg as any);
              io.to(SocketRooms.org(orgId)).emit('message:new', botMsg as any);
            }
          })
          .catch(err => console.error('[socket] bot reply error:', err));

      } else if (!conversation.chatbotId && !conversation.assignedAgentId) {
        // Fallback: generic AI reply if no chatbot assigned and no agent online
        const plan = Plan[conversation.organization.plan as keyof typeof Plan] ?? Plan.FREE;
        if (canUseFeature(plan, 'aiBotMode')) {
          const cached    = await redis.get(CacheKeys.orgAgents(orgId)).catch(() => null);
          const hasAgents = cached && (JSON.parse(cached) as any[]).length > 0;
          if (!hasAgents) {
            setTimeout(async () => {
              const allMsgs  = await prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' }, take: 20 });
              const settings = JSON.parse(conversation.organization.widgetSettingsJson || '{}');
              const botReply = await aiService.generateBotReply(allMsgs as any, conversation.organization.name, settings.customAiPersona);
              const botMsg   = await conversationService.addMessage({ conversationId, organizationId: orgId, senderType: MessageSenderType.BOT, content: botReply });
              io.to(SocketRooms.conversation(conversationId)).emit('message:new', botMsg as any);
            }, 1500);
          }
        }
      }
    } catch (err) {
      console.error('widget:message error', err);
      socket.emit('error', { code: 'MESSAGE_FAILED', message: 'Failed to send message' });
    }
  });

  const typingHandler = ({ conversationId, isTyping }: any) => {
    socket.to(SocketRooms.conversation(conversationId)).emit('visitor:typing', { conversationId, isTyping });
    io.to(SocketRooms.org(orgId)).emit('visitor:typing', { conversationId, isTyping });
  };
  socket.on('widget:typing',   typingHandler);
  socket.on('visitor:typing',  typingHandler);

  socket.on('widget:read', async ({ conversationId }: any) => {
    const readAt = new Date();
    await prisma.message.updateMany({ where: { conversationId, senderType: 'AGENT', readAt: null }, data: { readAt } });
    io.to(SocketRooms.conversation(conversationId)).emit('message:read', { conversationId, readAt });
  });
}

// ─────────────────────────────────────────────
//  Agent connection
// ─────────────────────────────────────────────
async function handleAgent(socket: any, io: IO, orgId: string) {
  const agentId   = socket.data['agentId']   as string;
  const agentName = socket.data['agentName'] as string;

  await socket.join(SocketRooms.org(orgId));
  await socket.join(SocketRooms.agent(agentId));
  await setAgentStatus(agentId, orgId, AgentStatus.ONLINE, io);

  socket.on('agent:join', async ({ organizationId }: { organizationId: string }) => {
    if (organizationId !== orgId) return;
    const agents = await getOnlineAgents(orgId);
    socket.emit('agents:online', { agents });
  });

  socket.on('agent:message', async ({ conversationId, content, isInternalNote }: any) => {
    try {
      const conv = await prisma.conversation.findFirst({
        where: { id: conversationId, organizationId: orgId },
        include: { organization: { select: { plan: true, name: true } } },
      });
      if (!conv) return;

      // Block sending to resolved conversations (internal notes are still allowed for audit purposes)
      if (conv.status === 'RESOLVED' && !isInternalNote) {
        socket.emit('error', { code: 'CONVERSATION_RESOLVED', message: 'This conversation is resolved.' });
        return;
      }

      const message = await conversationService.addMessage({
        conversationId, organizationId: orgId,
        senderType: MessageSenderType.AGENT, senderId: agentId, content, isInternalNote,
      });

      io.to(SocketRooms.conversation(conversationId)).emit('message:new', message as any);
      if (!isInternalNote) io.to(SocketRooms.org(orgId)).emit('message:new', message as any);

      // AI suggestions in background
      const plan = Plan[conv.organization.plan as keyof typeof Plan] ?? Plan.FREE;
      if (canUseFeature(plan, 'aiReplySuggestions')) {
        const msgs = await prisma.message.findMany({ where: { conversationId, isInternalNote: false }, orderBy: { createdAt: 'asc' }, take: 15 });
        aiService.generateReplySuggestions(msgs as any, agentName, conv.organization.name)
          .then(suggestions => {
            io.to(SocketRooms.agent(agentId)).emit('conversation:updated', { id: conversationId } as any);
          })
          .catch(console.error);
      }
    } catch (err) {
      console.error('agent:message error', err);
      socket.emit('error', { code: 'MESSAGE_FAILED', message: 'Failed to send message' });
    }
  });

  socket.on('agent:typing', ({ conversationId, isTyping }: any) => {
    socket.to(SocketRooms.conversation(conversationId)).emit('agent:typing', { conversationId, agentName, isTyping });
  });

  socket.on('agent:status', async ({ status }: { status: AgentStatus }) => {
    await setAgentStatus(agentId, orgId, status, io);
  });

  socket.on('agent:assign', async ({ conversationId, agentId: targetId }: any) => {
    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data:  { assignedAgentId: targetId, status: 'ASSIGNED' },
      include: { assignedAgent: { select: { id: true, name: true, avatarUrl: true, status: true } } },
    });
    if (updated.assignedAgent) {
      io.to(SocketRooms.org(orgId)).emit('conversation:assigned', { conversationId, agent: updated.assignedAgent as any });
    }
  });

  socket.on('disconnect', async () => {
    await setAgentStatus(agentId, orgId, AgentStatus.OFFLINE, io);
  });
}

// ── Helpers ────────────────────────────────────
async function setAgentStatus(agentId: string, orgId: string, status: AgentStatus, io: IO) {
  await Promise.all([
    prisma.agent.update({ where: { id: agentId }, data: { status, lastSeenAt: new Date() } }),
    redis?.setex(CacheKeys.agentStatus(agentId), TTL.agentStatus, status),
    redis.del(CacheKeys.orgAgents(orgId)),
  ]);
  io.to(SocketRooms.org(orgId)).emit('agent:status_changed', { agentId, status });
}

async function getOnlineAgents(orgId: string) {
  const cached = await redis.get(CacheKeys.orgAgents(orgId)).catch(() => null);
  if (cached) return JSON.parse(cached);

  const agents = await prisma.agent.findMany({
    where:  { organizationId: orgId, status: 'ONLINE', isActive: true },
    select: { id: true, name: true, avatarUrl: true, status: true },
  });
  if (redis) {
    await redis?.setex(
      CacheKeys.orgAgents(orgId),
      TTL.orgAgents,
      JSON.stringify(agents)
    ).catch(() => null);
  }
  return agents;
}
