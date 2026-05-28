import Anthropic from '@anthropic-ai/sdk';
import { env } from '../lib/env.js';
import type { Message } from '../types';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

function buildHistory(messages: Message[]): string {
  return messages
    .filter(m => !m.isInternalNote)
    .slice(-10)
    .map(m => `${m.senderType === 'VISITOR' ? 'Visitor' : m.senderType === 'AGENT' ? 'Agent' : 'Bot'}: ${m.content}`)
    .join('\n');
}

export async function generateReplySuggestions(
  messages: Message[], agentName: string, orgName: string
): Promise<string[]> {
  const history = buildHistory(messages);
  if (!history) return [];

  const res = await anthropic.messages.create({
    model: 'claude-haiku-20240307',
    max_tokens: 400,
    system: `You are generating reply suggestions for ${agentName}, a customer support agent at ${orgName}. 
Generate exactly 3 short professional replies, numbered 1. 2. 3., one per line. 
Each should be 1–3 sentences, empathetic, and directly address the visitor's last message.
Return only the 3 numbered suggestions — no other text.`,
    messages: [{ role: 'user', content: `Conversation:\n${history}\n\nGenerate 3 reply suggestions.` }],
  });

  const text = res.content[0]?.type === 'text' ? res.content[0].text : '';
  return text
    .split('\n')
    .filter(l => /^\d\./.test(l.trim()))
    .map(l => l.replace(/^\d\.\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 3);
}

export async function generateChatSummary(
  messages: Message[], visitorName: string | null
): Promise<string> {
  const history = buildHistory(messages);
  const res = await anthropic.messages.create({
    model: 'claude-haiku-20240307',
    max_tokens: 150,
    system: `Summarize customer support conversations in 1–2 sentences. 
State: what the visitor needed, how it was resolved, any follow-up needed.
Return only the summary — no preamble.`,
    messages: [{ role: 'user', content: `Summarize this conversation with ${visitorName ?? 'a visitor'}:\n\n${history}` }],
  });
  return res.content[0]?.type === 'text' ? res.content[0].text.trim() : 'Summary unavailable.';
}

const AUTO_TAGS = ['billing', 'technical', 'sales', 'general', 'refund', 'urgent', 'bug'] as const;

export async function generateAutoTags(messages: Message[]): Promise<string[]> {
  const history = buildHistory(messages);
  const res = await anthropic.messages.create({
    model: 'claude-haiku-20240307',
    max_tokens: 50,
    system: `Categorize support conversations. Pick up to 2 tags from: ${AUTO_TAGS.join(', ')}.
Return only the tag names as a comma-separated list. Nothing else.`,
    messages: [{ role: 'user', content: `Categorize:\n${history}` }],
  });
  const text = res.content[0]?.type === 'text' ? res.content[0].text : '';
  return text.split(',').map(t => t.trim().toLowerCase()).filter(t => (AUTO_TAGS as readonly string[]).includes(t));
}

export async function generateBotReply(
  messages: Message[], orgName: string, customPersona?: string
): Promise<string> {
  const history = buildHistory(messages);
  const system = customPersona ?? `You are a helpful AI assistant for ${orgName}'s support. Be friendly, concise, and professional. If you cannot resolve an issue, let the visitor know a human agent will follow up.`;
  const res = await anthropic.messages.create({
    model: 'claude-haiku-20240307',
    max_tokens: 200,
    system,
    messages: [{ role: 'user', content: history + '\n\nRespond to the last visitor message.' }],
  });
  return res.content[0]?.type === 'text' ? res.content[0].text.trim() : "Thanks for your message! A support agent will be with you shortly.";
}

export const aiService = { generateReplySuggestions, generateChatSummary, generateAutoTags, generateBotReply };
