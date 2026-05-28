import Anthropic          from '@anthropic-ai/sdk';
import { prisma }         from '../lib/prisma';
import { Plan }           from '../types';
import { PLAN_LIMITS }    from '../types';
import { getKnowledgeContext } from './knowledge.service.js';

const anthropic = new Anthropic();

function planOf(org: { plan: string }): Plan { return org.plan as Plan; }

async function getOrg(orgId: string) {
  return prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
}

// ── CRUD ──────────────────────────────────────────────────────────────────

export async function listChatbots(organizationId: string) {
  return prisma.chatbot.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    include: {
      knowledgeSources: {
        include: {
          knowledgeSource: {
            select: { id: true, title: true, type: true, charCount: true },
          },
        },
      },
    },
  });
}

export async function getChatbot(id: string, organizationId: string) {
  return prisma.chatbot.findFirstOrThrow({
    where: { id, organizationId },
    include: {
      knowledgeSources: { include: { knowledgeSource: true } },
    },
  });
}

export async function createChatbot(organizationId: string, data: {
  name: string;
  persona: string;
  welcomeMessage: string;
  handoffMessage: string;
  handoffKeywords: string;
  autoHandoff: boolean;
  knowledgeIds?: string[];
}) {
  const org    = await getOrg(organizationId);
  const limits = PLAN_LIMITS[planOf(org)];
  const count  = await prisma.chatbot.count({ where: { organizationId } });

  if (limits.maxChatbots === 0) {
    throw Object.assign(new Error('AI chatbots not available on your plan'), { code: 'PLAN_LIMIT' });
  }
  if (limits.maxChatbots !== -1 && count >= limits.maxChatbots) {
    throw Object.assign(new Error(`Chatbot limit (${limits.maxChatbots}) reached`), { code: 'PLAN_LIMIT' });
  }

  const bot = await prisma.chatbot.create({
    data: {
      organizationId,
      name:            data.name,
      persona:         data.persona,
      welcomeMessage:  data.welcomeMessage,
      handoffMessage:  data.handoffMessage,
      handoffKeywords: data.handoffKeywords,
      handoffTriggers: data.handoffKeywords,
      autoHandoff:     data.autoHandoff,
      status:          'DRAFT',
    },
  });

  if (data.knowledgeIds?.length) {
    await attachKnowledge(bot.id, organizationId, data.knowledgeIds);
  }

  return bot;
}

export async function updateChatbot(
  id: string,
  organizationId: string,
  data: Partial<{
    name: string; persona: string; welcomeMessage: string;
    handoffMessage: string; handoffKeywords: string; autoHandoff: boolean;
    knowledgeIds: string[];
  }>,
) {
  await prisma.chatbot.findFirstOrThrow({ where: { id, organizationId } });

  const { knowledgeIds, ...rest } = data;
  const updated = await prisma.chatbot.update({ where: { id }, data: rest });

  if (knowledgeIds !== undefined) {
    await prisma.chatbotKnowledge.deleteMany({ where: { chatbotId: id } });
    await attachKnowledge(id, organizationId, knowledgeIds);
  }

  return updated;
}

export async function deleteChatbot(id: string, organizationId: string) {
  await prisma.chatbot.deleteMany({ where: { id, organizationId } });
}

export async function activateChatbot(id: string, organizationId: string) {
  await prisma.chatbot.findFirstOrThrow({ where: { id, organizationId } });
  return prisma.chatbot.update({ where: { id }, data: { status: 'ACTIVE' } });
}

export async function pauseChatbot(id: string, organizationId: string) {
  await prisma.chatbot.findFirstOrThrow({ where: { id, organizationId } });
  return prisma.chatbot.update({ where: { id }, data: { status: 'PAUSED' } });
}

async function attachKnowledge(botId: string, orgId: string, ids: string[]) {
  // Verify sources belong to org
  const valid = await prisma.knowledgeSource.findMany({
    where: { id: { in: ids }, organizationId: orgId },
    select: { id: true },
  });
  if (!valid.length) return;
  await prisma.chatbotKnowledge.createMany({
    data: valid.map(s => ({ chatbotId: botId, knowledgeSourceId: s.id })),
    skipDuplicates: true,
  });
}

// ── Bot reply (called from socket / widget route) ─────────────────────────

export async function getBotReply(
  chatbotId: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  visitorMessage: string,
): Promise<{ reply: string; shouldHandoff: boolean }> {

  const bot = await prisma.chatbot.findUnique({
    where: { id: chatbotId },
    include: {
      knowledgeSources: {
        where: { knowledgeSource: { isIndexed: true } },
        include: { knowledgeSource: { select: { id: true } } },
      },
    },
  });

  if (!bot || bot.status !== 'ACTIVE') {
    return { reply: '', shouldHandoff: true };
  }

  // Check if visitor is asking for human
  const keywords = bot.handoffKeywords
    .toLowerCase()
    .split(/[,;\n]+/)
    .map(k => k.trim())
    .filter(Boolean);
  const msgLower = visitorMessage.toLowerCase();
  const wantsHuman = keywords.some(k => msgLower.includes(k));

  if (wantsHuman && bot.autoHandoff) {
    await prisma.chatbot.update({
      where: { id: chatbotId },
      data: {
        totalChats:   { increment: 1 },
        handoffCount: { increment: 1 },
      },
    });
    return { reply: bot.handoffMessage, shouldHandoff: true };
  }

  // Build knowledge context
  const kIds = bot.knowledgeSources.map(k => k.knowledgeSource.id);
  const kCtx = await getKnowledgeContext(kIds);
  const hasKnowledge = kCtx.trim().length > 0;

  // System prompt instructs the model to answer from KB/history first,
  // and only request a handoff when it genuinely cannot help.
  // We ask for a JSON response so the handoff decision is explicit and
  // cannot be triggered by incidental phrases in the answer text.
  const systemPrompt = [
    bot.persona,
    '',
    hasKnowledge
      ? `You have access to the following knowledge base. Always try to answer from it first:\n\n${kCtx}`
      : 'You do not have a specific knowledge base. Use the conversation history and your general knowledge to help.',
    '',
    'You must also use the conversation history to provide contextual answers — do not repeat information already given.',
    '',
    'RESPONSE FORMAT: You must respond with a single JSON object, no other text.',
    'Schema: { "reply": "<your response to the visitor>", "handoff": <true|false> }',
    '',
    'Set "handoff" to true ONLY when ALL of the following are true:',
    '  1. The question cannot be answered from the knowledge base or conversation history.',
    '  2. You have already tried to help and the visitor still needs assistance you cannot provide.',
    hasKnowledge
      ? '  3. The knowledge base exists but does not contain relevant information for this specific query.'
      : '  3. No relevant context is available to address the visitor\'s concern.',
    '',
    'Set "handoff" to false if you can fully or partially answer the question.',
    'Do NOT set "handoff" to true just because the visitor seems frustrated or asks follow-up questions.',
    'Be concise. Avoid markdown formatting in the reply.',
  ].join('\n');

  try {
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 600,
      system:     systemPrompt,
      messages:   [
        ...conversationHistory,
        { role: 'user', content: visitorMessage },
      ],
    });

    const rawText = (response.content[0] as any)?.text ?? '';

    // Parse structured JSON response
    let reply        = bot.handoffMessage;
    let shouldHandoff = false;

    try {
      // Strip any accidental markdown fences the model may have added
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      const parsed  = JSON.parse(cleaned);

      reply = (typeof parsed.reply === 'string' && parsed.reply.trim())
        ? parsed.reply.trim()
        : bot.handoffMessage;

      // Only honour handoff=true if autoHandoff is enabled on the bot
      shouldHandoff = bot.autoHandoff && parsed.handoff === true;
    } catch {
      // Model didn't return valid JSON — use its raw text as reply and
      // do NOT handoff; we still got something useful.
      reply         = rawText.trim() || bot.handoffMessage;
      shouldHandoff = false;
      console.warn('[chatbot] non-JSON response from model, using raw text');
    }

    // Update stats
    await prisma.chatbot.update({
      where: { id: chatbotId },
      data: {
        totalChats:      { increment: 1 },
        handoffCount:    shouldHandoff ? { increment: 1 } : undefined,
        resolutionCount: !shouldHandoff ? { increment: 1 } : undefined,
      },
    });

    return { reply, shouldHandoff };

  } catch (err) {
    console.error('[chatbot] AI error:', err);
    await prisma.chatbot.update({
      where: { id: chatbotId },
      data: {
        totalChats:   { increment: 1 },
        handoffCount: { increment: 1 },
      },
    }).catch(() => null);
    return { reply: bot.handoffMessage, shouldHandoff: true };
  }
}

// ── Handoff ───────────────────────────────────────────────────────────────

export async function performHandoff(conversationId: string, orgId: string, reason?: string) {
  const conv = await prisma.conversation.findFirstOrThrow({
    where: { id: conversationId, organizationId: orgId },
  });

  const availableAgent = await prisma.agent.findFirst({
    where: {
      organizationId: orgId,
      status: 'ONLINE',
      isActive: true,
      role: { in: ['OWNER', 'ADMIN', 'AGENT'] },
    },
    orderBy: { assignedConversations: { _count: 'asc' } },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status:          availableAgent ? 'ASSIGNED' : 'OPEN',
      assignedAgentId: availableAgent?.id ?? null,
      botHandedOff:    true,
      chatbotId:       null,
    },
  });

  // System message
  await prisma.message.create({
    data: {
      conversationId,
      senderType:     'SYSTEM',
      content:        reason
        ? `Bot handed off to human agent. Reason: ${reason}`
        : 'Bot handed off to human agent. Awaiting assignment.',
    },
  });

  return { success: true };
}
