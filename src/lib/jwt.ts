import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { env } from './env.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);

export interface AgentTokenPayload extends JWTPayload {
  agentId:        string;
  organizationId: string;
  email:          string;
  role:           string;
}

export async function signToken(
  payload: Omit<AgentTokenPayload, keyof JWTPayload>
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .setIssuer('livesupport')
    .setAudience('livesupport-app')
    .sign(secret);
}

export async function verifyToken(token: string): Promise<AgentTokenPayload> {
  const { payload } = await jwtVerify(token, secret, {
    issuer:   'livesupport',
    audience: 'livesupport-app',
  });
  return payload as AgentTokenPayload;
}

export function extractBearerToken(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7);
}
