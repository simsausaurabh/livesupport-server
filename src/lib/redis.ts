// ─────────────────────────────────────────────
// LiveSupport — Redis Client
// ─────────────────────────────────────────────

import IORedis from 'ioredis';
import { env } from './env.js';

const Redis = IORedis as any;

let redis: any = null;

export function getRedis() {
  if (redis) return redis;

  if (!env.REDIS_URL) {
    console.warn('⚠️ REDIS_URL missing');
    return null;
  }

  redis = new Redis(env.REDIS_URL, {
    retryStrategy: (times: number) =>
      Math.min(times * 200, 5000),

    reconnectOnError: (err: Error) =>
      err.message.includes('READONLY'),

    enableReadyCheck: true,
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });

  redis.on('connect', () => {
    console.log('✅ Redis connected');
  });

  redis.on('ready', () => {
    console.log('✅ Redis ready');
  });

  redis.on('error', (err: Error) => {
    console.error('❌ Redis error:', err.message);
  });

  redis.on('close', () => {
    console.warn('⚠️ Redis connection closed');
  });

  redis.on('reconnecting', () => {
    console.log('🔄 Redis reconnecting...');
  });

  redis.connect().catch((err: Error) => {
    console.error('❌ Redis connection failed:', err.message);
  });

  return redis;
}

export { redis };

// ─────────────────────────────────────────────
// Cache Keys
// ─────────────────────────────────────────────

export const CacheKeys = {
  agentStatus: (agentId: string) =>
    `ls:agent:status:${agentId}`,

  orgAgents: (orgId: string) =>
    `ls:org:agents:${orgId}`,

  widgetConfig: (widgetKey: string) =>
    `ls:widget:cfg:${widgetKey}`,

  session: (token: string) =>
    `ls:session:${token}`,

  visitorCount: (orgId: string) =>
    `ls:visitors:${orgId}`,

  rateLimitIP: (ip: string) =>
    `ls:rl:ip:${ip}`,
} as const;

// ─────────────────────────────────────────────
// TTL
// ─────────────────────────────────────────────

export const TTL = {
  agentStatus: 30,
  orgAgents: 60,
  widgetConfig: 300,
  session: 604800,
} as const;