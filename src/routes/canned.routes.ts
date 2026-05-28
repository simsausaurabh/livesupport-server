import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/error.js';

export const cannedRouter = Router();
cannedRouter.use(requireAuth);

// GET /api/canned — list all for org
cannedRouter.get('/', asyncHandler(async (req, res) => {
  const search = req.query['search'] as string | undefined;
  const items = await prisma.cannedResponse.findMany({
    where: {
      organizationId: req.agent!.organizationId,
      ...(search && {
        OR: [
          { shortcut: { contains: search } },
          { title:    { contains: search } },
          { content:  { contains: search } },
        ],
      }),
    },
    include: { createdByAgent: { select: { name: true } } },
    orderBy: { shortcut: 'asc' },
  });
  res.json({ success: true, data: items });
}));

// POST /api/canned
cannedRouter.post('/', requirePermission('org:manage_canned_responses'), asyncHandler(async (req, res) => {
  const body = z.object({
    shortcut: z.string().min(1).max(50).regex(/^\//, 'Shortcut must start with /'),
    title:    z.string().min(1).max(200),
    content:  z.string().min(1).max(10000),
  }).parse(req.body);

  const existing = await prisma.cannedResponse.findUnique({
    where: { organizationId_shortcut: { organizationId: req.agent!.organizationId, shortcut: body.shortcut } },
  });
  if (existing) throw new AppError(409, 'SHORTCUT_EXISTS', `Shortcut ${body.shortcut} already exists`);

  const item = await prisma.cannedResponse.create({
    data: {
      title: body.title,
      shortcut: body.shortcut,
      content: body.content,
      organizationId: req.agent!.organizationId,
      createdByAgentId: req.agent!.id,
    },
  });
  res.status(201).json({ success: true, data: item });
}));

// PUT /api/canned/:id
cannedRouter.put('/:id', requirePermission('org:manage_canned_responses'), asyncHandler(async (req, res) => {
  const body = z.object({
    shortcut: z.string().min(1).max(50).optional(),
    title:    z.string().min(1).max(200).optional(),
    content:  z.string().min(1).max(10000).optional(),
  }).parse(req.body);

  const item = await prisma.cannedResponse.findFirst({
    where: { id: req.params['id']!, organizationId: req.agent!.organizationId },
  });
  if (!item) throw new AppError(404, 'NOT_FOUND', 'Canned response not found');

  const updated = await prisma.cannedResponse.update({ where: { id: item.id }, data: body });
  res.json({ success: true, data: updated });
}));

// DELETE /api/canned/:id
cannedRouter.delete('/:id', requirePermission('org:manage_canned_responses'), asyncHandler(async (req, res) => {
  const item = await prisma.cannedResponse.findFirst({
    where: { id: req.params['id']!, organizationId: req.agent!.organizationId },
  });
  if (!item) throw new AppError(404, 'NOT_FOUND', 'Canned response not found');
  await prisma.cannedResponse.delete({ where: { id: item.id } });
  res.json({ success: true, data: null });
}));
