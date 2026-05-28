import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/error.js';
import { AgentRole, Plan } from '../types';

export const authRouter = Router();

const registerSchema = z.object({
  orgName:  z.string().min(2).max(100),
  email:    z.string().email(),
  password: z.string().min(8).max(100),
  name:     z.string().min(2).max(100),
});

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/register
authRouter.post('/register', asyncHandler(async (req, res) => {
  const body = registerSchema.parse(req.body);

  const existing = await prisma.agent.findFirst({ where: { email: body.email } });
  if (existing) throw new AppError(409, 'EMAIL_EXISTS', 'Email already registered');

  const baseSlug     = body.orgName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 60);
  const existingSlug = await prisma.organization.findUnique({ where: { slug: baseSlug } });
  const slug         = existingSlug ? `${baseSlug}-${Date.now()}` : baseSlug;
  const passwordHash = await bcrypt.hash(body.password, 12);

  const defaultSettings = {
    primaryColor: '#0f172a', textColor: '#ffffff', logoUrl: null,
    brandName: body.orgName,
    greetingMessage: 'Hi! How can we help you today?',
    offlineMessage: "We're offline. Leave us a message!",
    launcherPosition: 'bottom-right', language: 'en',
    showAgentAvatar: true, collectEmailBeforeChat: false,
  };

  const { org, agent } = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: { name: body.orgName, slug, plan: Plan.FREE, widgetSettingsJson: JSON.stringify(defaultSettings) },
    });
    const agent = await tx.agent.create({
      data: { organizationId: org.id, email: body.email, name: body.name, passwordHash, role: AgentRole.OWNER },
    });
    return { org, agent };
  });

  const token = await signToken({ agentId: agent.id, organizationId: org.id, email: agent.email, role: agent.role });
  res.status(201).json({
    success: true,
    data: {
      token,
      agent: { id: agent.id, name: agent.name, email: agent.email, role: agent.role },
      organization: { id: org.id, name: org.name, slug: org.slug, plan: org.plan, widgetKey: org.widgetKey },
    },
  });
}));

// POST /api/auth/login
authRouter.post('/login', asyncHandler(async (req, res) => {
  const body  = loginSchema.parse(req.body);
  const agent = await prisma.agent.findFirst({
    where: { email: body.email, isActive: true },
    include: { organization: { select: { id: true, name: true, slug: true, plan: true, widgetKey: true } } },
  });
  if (!agent?.passwordHash) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  const valid = await bcrypt.compare(body.password, agent.passwordHash);
  if (!valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

  await prisma.agent.update({ where: { id: agent.id }, data: { lastSeenAt: new Date() } });
  const token = await signToken({ agentId: agent.id, organizationId: agent.organizationId, email: agent.email, role: agent.role });
  res.json({
    success: true,
    data: {
      token,
      agent: { id: agent.id, name: agent.name, email: agent.email, role: agent.role, status: agent.status, avatarUrl: agent.avatarUrl },
      organization: agent.organization,
    },
  });
}));

// GET /api/auth/me
authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const agent = await prisma.agent.findUnique({
    where: { id: req.agent!.id },
    include: {
      organization: {
        select: { id: true, name: true, slug: true, plan: true, widgetKey: true, widgetSettingsJson: true, maxAgents: true, monthlyVisitorLimit: true, chatHistoryMonths: true },
      },
    },
  });
  if (!agent) throw new AppError(404, 'NOT_FOUND', 'Agent not found');
  res.json({ success: true, data: { agent: { id: agent.id, name: agent.name, email: agent.email, role: agent.role, status: agent.status, avatarUrl: agent.avatarUrl, ratingAvg: agent.ratingAvg, ratingCount: agent.ratingCount }, organization: agent.organization } });
}));
