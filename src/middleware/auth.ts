import type { Request, Response, NextFunction } from 'express';
import { verifyToken, extractBearerToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import { hasPermission, canUseFeature, Plan } from '../types';
import type { Permission, AgentRole } from '../types';

declare global {
  namespace Express {
    interface Request {
      agent?: {
        id:             string;
        organizationId: string;
        email:          string;
        role:           AgentRole;
        name:           string;
      };
    }
  }
}

// ── requireAuth ────────────────────────────────
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }
  try {
    const payload = await verifyToken(token);
    const agent = await prisma.agent.findFirst({
      where: { id: payload.agentId, organizationId: payload.organizationId, isActive: true },
      select: { id: true, organizationId: true, email: true, role: true, name: true },
    });
    if (!agent) {
      res.status(401).json({ success: false, error: { code: 'AGENT_NOT_FOUND', message: 'Agent not found or inactive' } });
      return;
    }
    req.agent = { ...agent, role: agent.role as AgentRole };
    next();
  } catch {
    res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } });
  }
}

// ── requirePermission ─────────────────────────
export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.agent) { res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } }); return; }
    if (!hasPermission(req.agent.role, permission)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: `Requires: ${permission}` } });
      return;
    }
    next();
  };
}

// ── requirePlanFeature ────────────────────────
export function requirePlanFeature(feature: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.agent) { res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } }); return; }
    const org = await prisma.organization.findUnique({
      where: { id: req.agent.organizationId }, select: { plan: true },
    });
    if (!org) { res.status(404).json({ success: false, error: { code: 'ORG_NOT_FOUND', message: 'Org not found' } }); return; }
    const planEnum = Plan[org.plan as keyof typeof Plan] ?? Plan.FREE;
    if (!canUseFeature(planEnum, feature as any)) {
      res.status(403).json({ success: false, error: { code: 'PLAN_LIMIT', message: `Upgrade required for: ${feature}` } });
      return;
    }
    next();
  };
}
