import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listChatbots,
  getChatbot,
  createChatbot,
  updateChatbot,
  deleteChatbot,
  activateChatbot,
  pauseChatbot,
  performHandoff,
} from '../services/chatbot.service.js';

export const chatbotsRouter = Router();

// GET /api/chatbots
chatbotsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const bots = await listChatbots(req.agent!.organizationId);
    res.json({ success: true, data: bots });
  } catch (err) { next(err); }
});

// GET /api/chatbots/:id
chatbotsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const bot = await getChatbot(req.params.id!, req.agent!.organizationId);
    res.json({ success: true, data: bot });
  } catch (err) { next(err); }
});

// POST /api/chatbots
chatbotsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, persona, welcomeMessage, handoffMessage, handoffKeywords, autoHandoff, knowledgeIds } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, error: { message: 'Name required' } });
    const bot = await createChatbot(req.agent!.organizationId, {
      name, persona: persona ?? 'You are a helpful support assistant.',
      welcomeMessage: welcomeMessage ?? 'Hi! How can I help you today?',
      handoffMessage: handoffMessage ?? 'Let me connect you with a human agent.',
      handoffKeywords: handoffKeywords ?? 'human,agent,speak to someone',
      autoHandoff:     autoHandoff !== false,
      knowledgeIds:    knowledgeIds ?? [],
    });
    res.status(201).json({ success: true, data: bot });
  } catch (err: any) {
    if (err.code === 'PLAN_LIMIT') return res.status(403).json({ success: false, error: { code: 'PLAN_LIMIT', message: err.message } });
    next(err);
  }
});

// PATCH /api/chatbots/:id
chatbotsRouter.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const bot = await updateChatbot(req.params.id!, req.agent!.organizationId, req.body);
    res.json({ success: true, data: bot });
  } catch (err) { next(err); }
});

// DELETE /api/chatbots/:id
chatbotsRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    await deleteChatbot(req.params.id!, req.agent!.organizationId);
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});

// POST /api/chatbots/:id/activate
chatbotsRouter.post('/:id/activate', requireAuth, async (req, res, next) => {
  try {
    const bot = await activateChatbot(req.params.id!, req.agent!.organizationId);
    res.json({ success: true, data: bot });
  } catch (err) { next(err); }
});

// POST /api/chatbots/:id/pause
chatbotsRouter.post('/:id/pause', requireAuth, async (req, res, next) => {
  try {
    const bot = await pauseChatbot(req.params.id!, req.agent!.organizationId);
    res.json({ success: true, data: bot });
  } catch (err) { next(err); }
});

// POST /api/conversations/:id/handoff  (proxied here for chatbot context)
chatbotsRouter.post('/handoff/:conversationId', requireAuth, async (req, res, next) => {
  try {
    const result = await performHandoff(
      req.params.conversationId!,
      req.agent!.organizationId,
      req.body.reason,
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});
