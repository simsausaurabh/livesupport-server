import type { AgentPublic, Conversation, Message, WidgetSettings } from './entities.js';
import type { AgentStatus, ConversationStatus } from './enums.js';

// ── Generic API envelope ───────────────────────
export interface ApiResponse<T = void> {
  success: true;
  data:    T;
}
export interface ApiError {
  success: false;
  error: { code: string; message: string; details?: Record<string, string[]> };
}
export type ApiResult<T = void> = ApiResponse<T> | ApiError;

export interface PaginatedResponse<T> {
  items:    T[];
  total:    number;
  page:     number;
  pageSize: number;
  hasMore:  boolean;
}

// ── Widget init ────────────────────────────────
export interface WidgetInitResponse {
  visitorId:              string;
  widgetSettings:         WidgetSettings;
  onlineAgents:           AgentPublic[];
  previousConversationId: string | null;
}

// ── Socket events ──────────────────────────────
export interface ClientToServerEvents {
  'widget:join':    (p: { conversationId: string; visitorId: string }) => void;
  'widget:message': (p: { conversationId: string; content: string }) => void;
  'widget:typing':  (p: { conversationId: string; isTyping: boolean }) => void;
  'widget:read':    (p: { conversationId: string }) => void;

  'agent:join':     (p: { organizationId: string }) => void;
  'agent:message':  (p: { conversationId: string; content: string; isInternalNote?: boolean }) => void;
  'agent:typing':   (p: { conversationId: string; isTyping: boolean }) => void;
  'agent:status':   (p: { status: AgentStatus }) => void;
  'agent:read':     (p: { conversationId: string }) => void;
  'agent:assign':   (p: { conversationId: string; agentId: string }) => void;
}

export interface ServerToClientEvents {
  'conversation:new':      (p: Conversation) => void;
  'conversation:assigned': (p: { conversationId: string; agent: AgentPublic }) => void;
  'conversation:resolved': (p: { conversationId: string }) => void;
  'conversation:updated':  (p: Partial<Conversation> & { id: string }) => void;

  'message:new':           (p: Message) => void;
  'message:read':          (p: { conversationId: string; readAt: Date }) => void;

  'agent:typing':          (p: { conversationId: string; agentName: string; isTyping: boolean }) => void;
  'visitor:typing':        (p: { conversationId: string; isTyping: boolean }) => void;
  'agent:status_changed':  (p: { agentId: string; status: AgentStatus }) => void;
  'agents:online':         (p: { agents: AgentPublic[] }) => void;

  'error':                 (p: { code: string; message: string }) => void;
}

// ── Socket room helpers ────────────────────────
export const SocketRooms = {
  org:          (orgId: string)    => `org:${orgId}`,
  conversation: (convId: string)   => `conv:${convId}`,
  agent:        (agentId: string)  => `agent:${agentId}`,
  visitor:      (vid: string)      => `visitor:${vid}`,
} as const;
