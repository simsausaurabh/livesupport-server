import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);
analyticsRouter.use(requirePermission('analytics:view'));

const rangeSchema = z.object({
  from: z.string().datetime().optional(),
  to:   z.string().datetime().optional(),
});

// GET /api/analytics/overview
analyticsRouter.get('/overview', asyncHandler(async (req, res) => {
  const { from, to } = rangeSchema.parse(req.query);
  const orgId    = req.agent!.organizationId;
  const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400_000);
  const toDate   = to   ? new Date(to)   : new Date();

  const [total, resolved, missed, totalMessages, avgResponse, avgDuration, avgRating] = await Promise.all([
    prisma.conversation.count({ where: { organizationId: orgId, createdAt: { gte: fromDate, lte: toDate } } }),
    prisma.conversation.count({ where: { organizationId: orgId, status: 'RESOLVED', createdAt: { gte: fromDate, lte: toDate } } }),
    prisma.conversation.count({ where: { organizationId: orgId, status: 'ABANDONED', createdAt: { gte: fromDate, lte: toDate } } }),
    prisma.message.count({ where: { conversation: { organizationId: orgId }, createdAt: { gte: fromDate, lte: toDate } } }),
    prisma.conversation.aggregate({ where: { organizationId: orgId, firstResponseSeconds: { not: null }, createdAt: { gte: fromDate, lte: toDate } }, _avg: { firstResponseSeconds: true } }),
    prisma.conversation.aggregate({ where: { organizationId: orgId, durationSeconds: { not: null }, createdAt: { gte: fromDate, lte: toDate } }, _avg: { durationSeconds: true } }),
    prisma.conversation.aggregate({ where: { organizationId: orgId, rating: { not: null }, createdAt: { gte: fromDate, lte: toDate } }, _avg: { rating: true } }),
  ]);

  res.json({
    success: true,
    data: {
      totalConversations:       total,
      resolvedConversations:    resolved,
      missedConversations:      missed,
      resolutionRate:           total > 0 ? Math.round((resolved / total) * 100) : 0,
      totalMessages,
      avgFirstResponseSeconds:  Math.round(avgResponse._avg.firstResponseSeconds ?? 0),
      avgDurationSeconds:       Math.round(avgDuration._avg.durationSeconds ?? 0),
      avgRating:                Math.round((avgRating._avg.rating ?? 0) * 10) / 10,
    },
  });
}));

// GET /api/analytics/agents
analyticsRouter.get('/agents', asyncHandler(async (req, res) => {
  const { from, to } = rangeSchema.parse(req.query);
  const orgId    = req.agent!.organizationId;
  const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400_000);
  const toDate   = to   ? new Date(to)   : new Date();

  const agents = await prisma.agent.findMany({
    where:  { organizationId: orgId, isActive: true, role: { in: ['OWNER', 'ADMIN', 'AGENT'] } },
    select: {
      id: true, name: true, avatarUrl: true, status: true, ratingAvg: true, ratingCount: true,
      assignedConversations: {
        where: { createdAt: { gte: fromDate, lte: toDate } },
        select: { id: true, status: true, durationSeconds: true, firstResponseSeconds: true },
      },
    },
  });

  const stats = agents.map(a => {
    const convs    = a.assignedConversations;
    const resolved = convs.filter(c => c.status === 'RESOLVED');
    const avgDur   = resolved.length ? Math.round(resolved.reduce((s, c) => s + (c.durationSeconds ?? 0), 0) / resolved.length) : 0;
    const withResp = convs.filter(c => c.firstResponseSeconds);
    const avgResp  = withResp.length ? Math.round(withResp.reduce((s, c) => s + (c.firstResponseSeconds ?? 0), 0) / withResp.length) : 0;
    return {
      id: a.id, name: a.name, avatarUrl: a.avatarUrl, status: a.status,
      ratingAvg: a.ratingAvg, ratingCount: a.ratingCount,
      totalConversations:  convs.length,
      resolvedConversations: resolved.length,
      resolutionRate:      convs.length ? Math.round((resolved.length / convs.length) * 100) : 0,
      avgDurationSeconds:  avgDur,
      avgFirstResponseSeconds: avgResp,
    };
  });

  res.json({ success: true, data: stats });
}));
