import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { redis, CacheKeys } from '../lib/redis.js';

export const widgetSettingsRouter = Router();
widgetSettingsRouter.use(requireAuth);

const settingsSchema = z.object({
  primaryColor:           z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  textColor:              z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  logoUrl:                z.string().url().nullable().optional(),
  brandName:              z.string().min(1).max(60).optional(),
  greetingMessage:        z.string().min(1).max(300).optional(),
  offlineMessage:         z.string().min(1).max(300).optional(),
  launcherPosition:       z.enum(['bottom-right', 'bottom-left']).optional(),
  language:               z.string().length(2).optional(),
  showAgentAvatar:        z.boolean().optional(),
  collectEmailBeforeChat: z.boolean().optional(),
  customAiPersona:        z.string().max(1000).optional(),
  proactiveGreeting:      z.boolean().optional(),
  proactiveMessage:       z.string().max(300).optional(),
  proactiveDelaySeconds:  z.number().int().min(0).max(60).optional(),
  periodicCheckin:        z.boolean().optional(),
  checkinIntervalSeconds: z.number().int().min(30).max(600).optional(),
  maxCheckins:            z.number().int().min(0).max(10).optional(),
  checkinMessage:         z.string().max(300).optional(),
  borderRadius:           z.string().max(20).optional(),
  width:                  z.string().max(20).optional(),
  chatBg:                 z.string().max(20).optional(),
  customCss:              z.string().max(5000).optional(),
  removeBranding:         z.boolean().optional(),
  inputPlaceholder:       z.string().max(100).optional(),
});

// GET /api/widget-settings
widgetSettingsRouter.get('/', asyncHandler(async (req, res) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.agent!.organizationId },
    select: { widgetSettingsJson: true, widgetKey: true, plan: true },
  });
  const settings = JSON.parse(org?.widgetSettingsJson || '{}');
  res.json({ success: true, data: { settings, widgetKey: org?.widgetKey, plan: org?.plan } });
}));

// PATCH /api/widget-settings
widgetSettingsRouter.patch('/', requirePermission('org:manage_widget'), asyncHandler(async (req, res) => {
  const updates = settingsSchema.parse(req.body);

  const org = await prisma.organization.findUnique({
    where: { id: req.agent!.organizationId },
    select: { widgetSettingsJson: true, widgetKey: true },
  });

  const current = JSON.parse(org?.widgetSettingsJson || '{}');
  const merged  = { ...current, ...updates };

  await prisma.organization.update({
    where: { id: req.agent!.organizationId },
    data:  { widgetSettingsJson: JSON.stringify(merged) },
  });

  // Bust widget config cache
  if (org?.widgetKey) {
    await redis.del(CacheKeys.widgetConfig(org.widgetKey)).catch(() => null);
  }

  res.json({ success: true, data: merged });
}));

// POST /api/widget-settings/regenerate-key — rotate widget key
widgetSettingsRouter.post('/regenerate-key', requirePermission('org:manage_widget'), asyncHandler(async (req, res) => {
  const { nanoid } = await import('nanoid');
  const newKey = nanoid(32);

  const old = await prisma.organization.findUnique({ where: { id: req.agent!.organizationId }, select: { widgetKey: true } });
  if (old?.widgetKey) await redis.del(CacheKeys.widgetConfig(old.widgetKey)).catch(() => null);

  const org = await prisma.organization.update({
    where: { id: req.agent!.organizationId },
    data:  { widgetKey: newKey },
    select: { widgetKey: true },
  });
  res.json({ success: true, data: { widgetKey: org.widgetKey } });
}));
