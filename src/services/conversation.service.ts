import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { ConversationStatus, MessageSenderType, Plan, canUseFeature } from '../types';
import { aiService } from './ai.service.js';

export async function getConversations(
  organizationId: string,
  opts: { status?: string; assignedAgentId?: string; page?: number; pageSize?: number; search?: string }
) {
  const { page = 1, pageSize = 20, status, assignedAgentId, search } = opts;

  const where: Prisma.ConversationWhereInput = {
    organizationId,
    ...(status           && { status: status as any }),
    ...(assignedAgentId  && { assignedAgentId }),
    ...(search           && {
      OR: [
        { visitor: { name:  { contains: search } } },
        { visitor: { email: { contains: search } } },
        { aiSummary: { contains: search } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: {
        visitor:       { select: { id: true, name: true, email: true, country: true, browserName: true, currentUrl: true } },
        assignedAgent: { select: { id: true, name: true, avatarUrl: true, status: true } },
        messages:      { orderBy: { createdAt: 'desc' }, take: 1, where: { isInternalNote: false } },
        conversationTags: { include: { tag: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.conversation.count({ where }),
  ]);

  return { items, total, page, pageSize, hasMore: page * pageSize < total };
}

export async function getConversationById(id: string, organizationId: string) {
  return prisma.conversation.findFirst({
    where: { id, organizationId },
    include: {
      visitor:          true,
      assignedAgent:    { select: { id: true, name: true, avatarUrl: true, status: true, email: true } },
      messages:         { orderBy: { createdAt: 'asc' } },
      conversationTags: { include: { tag: true } },
      agentRatings:     true,
    },
  });
}

export async function createConversation(data: { organizationId: string; visitorId: string; chatbotId?: string }) {
  // Bot conversations stay with the bot until explicit handoff.
  if (data.chatbotId) {
    return prisma.conversation.create({
      data: {
        organizationId: data.organizationId,
        visitorId:      data.visitorId,
        chatbotId:      data.chatbotId,
        status:         'BOT' as any,
      },
      include: {
        visitor:       true,
        assignedAgent: { select: { id: true, name: true, avatarUrl: true, status: true } },
      },
    });
  }

  // Round-robin auto-assign to agent with fewest open conversations
  const availableAgent = await prisma.agent.findFirst({
    where: {
      organizationId: data.organizationId,
      status: 'ONLINE',
      isActive: true,
      role: { in: ['OWNER', 'ADMIN', 'AGENT'] },
    },
    orderBy: { assignedConversations: { _count: 'asc' } },
  });

  return prisma.conversation.create({
    data: {
      organizationId:  data.organizationId,
      visitorId:       data.visitorId,
      assignedAgentId: availableAgent?.id ?? null,
      status:          availableAgent ? ConversationStatus.ASSIGNED : ConversationStatus.OPEN,
    },
    include: {
      visitor:       true,
      assignedAgent: { select: { id: true, name: true, avatarUrl: true, status: true } },
    },
  });
}

export async function addMessage(data: {
  conversationId: string;
  organizationId: string;
  senderType:     MessageSenderType;
  senderId?:      string;
  content:        string;
  isInternalNote?: boolean;
  isAiSuggested?:  boolean;
}) {
  const [message] = await Promise.all([
    prisma.message.create({
      data: {
        conversationId: data.conversationId,
        senderType:     data.senderType,
        senderId:       data.senderId ?? null,
        content:        data.content,
        isInternalNote: data.isInternalNote ?? false,
        isAiSuggested:  data.isAiSuggested ?? false,
      },
    }),
    prisma.conversation.update({
      where: { id: data.conversationId },
      data: {
        updatedAt:    new Date(),
        messageCount: { increment: 1 },
        ...(data.senderType === MessageSenderType.AGENT && { status: ConversationStatus.ASSIGNED }),
      },
    }),
  ]);
  return message;
}

export async function resolveConversation(
  conversationId: string,
  organizationId: string,
  orgPlan: string,
) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId },
    include: { messages: { orderBy: { createdAt: 'asc' } }, visitor: { select: { name: true } } },
  });
  if (!conversation) throw new Error('Conversation not found');

  const duration = Math.floor((Date.now() - conversation.createdAt.getTime()) / 1000);
  const plan = Plan[orgPlan as keyof typeof Plan] ?? Plan.FREE;

  let aiSummary: string | undefined;
  let autoTags: string[] = [];

  if (canUseFeature(plan, 'aiChatSummary') && conversation.messages.length > 2) {
    aiSummary = await aiService.generateChatSummary(conversation.messages as any, conversation.visitor.name).catch(() => undefined);
  }
  if (canUseFeature(plan, 'aiAutoTagging') && conversation.messages.length > 2) {
    autoTags = await aiService.generateAutoTags(conversation.messages as any).catch(() => []);
  }

  if (autoTags.length > 0) {
    const tags = await prisma.tag.findMany({ where: { organizationId, name: { in: autoTags } } });
    await prisma.conversationTag.createMany({
      data: tags.map(t => ({ conversationId, tagId: t.id })),
      skipDuplicates: true,
    });
  }

  return prisma.conversation.update({
    where: { id: conversationId },
    data: { status: ConversationStatus.RESOLVED, resolvedAt: new Date(), durationSeconds: duration, aiSummary },
  });
}


export async function handoffToAgent(conversationId: string, organizationId: string, reason?: string) {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: 'OPEN', botHandedOff: true, chatbotId: null },
  });
  await prisma.message.create({
    data: {
      conversationId,
      senderType: 'SYSTEM',
      content: reason ? `Bot handed off: ${reason}` : 'Connected you with a human agent.',
    },
  });
  return { success: true };
}

export const conversationService = { getConversations, getConversationById, createConversation, addMessage, resolveConversation, handoffToAgent };
