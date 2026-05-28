import type { Plan, AgentRole, AgentStatus, ConversationStatus, MessageSenderType } from './enums.js';
export type SupportedLanguage = 'en' | 'es' | 'fr' | 'de' | 'pt' | 'it' | 'nl' | 'pl' | 'hi' | 'ja' | 'zh' | 'ar';
export interface WidgetSettings {
    primaryColor: string;
    textColor: string;
    logoUrl: string | null;
    brandName: string;
    greetingMessage: string;
    offlineMessage: string;
    launcherPosition: 'bottom-right' | 'bottom-left';
    language: SupportedLanguage;
    showAgentAvatar: boolean;
    collectEmailBeforeChat: boolean;
    customAiPersona?: string;
}
export interface Organization {
    id: string;
    name: string;
    slug: string;
    domain: string | null;
    plan: Plan;
    widgetKey: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    trialEndsAt: Date | null;
    widgetSettings: WidgetSettings;
    monthlyVisitorLimit: number;
    chatHistoryMonths: number;
    maxAgents: number;
    currentMonthVisitors: number;
    createdAt: Date;
    updatedAt: Date;
}
export interface Agent {
    id: string;
    organizationId: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    role: AgentRole;
    status: AgentStatus;
    ratingAvg: number;
    ratingCount: number;
    isActive: boolean;
    lastSeenAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
export interface AgentPublic {
    id: string;
    name: string;
    avatarUrl: string | null;
    status: AgentStatus;
}
export interface Visitor {
    id: string;
    organizationId: string;
    fingerprint: string;
    email: string | null;
    name: string | null;
    ipAddress: string | null;
    country: string | null;
    city: string | null;
    browserName: string | null;
    osName: string | null;
    currentUrl: string | null;
    referrer: string | null;
    customData: Record<string, string | number | boolean>;
    firstSeenAt: Date;
    lastSeenAt: Date;
}
export interface Conversation {
    id: string;
    organizationId: string;
    visitorId: string;
    assignedAgentId: string | null;
    status: ConversationStatus;
    subject: string | null;
    aiSummary: string | null;
    rating: number | null;
    ratingComment: string | null;
    durationSeconds: number | null;
    firstResponseSeconds: number | null;
    messageCount: number;
    resolvedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    visitor?: Visitor;
    assignedAgent?: AgentPublic;
    lastMessage?: Message;
    unreadCount?: number;
}
export interface Message {
    id: string;
    conversationId: string;
    senderType: MessageSenderType;
    senderId: string | null;
    content: string;
    contentType: 'text' | 'html';
    isAiSuggested: boolean;
    isInternalNote: boolean;
    readAt: Date | null;
    createdAt: Date;
}
export interface CannedResponse {
    id: string;
    organizationId: string;
    shortcut: string;
    title: string;
    content: string;
    createdByAgentId: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface AgentRating {
    id: string;
    conversationId: string;
    agentId: string;
    organizationId: string;
    score: number;
    comment: string | null;
    createdAt: Date;
}
export interface Tag {
    id: string;
    organizationId: string;
    name: string;
    color: string;
    isAutoApplied: boolean;
}
export interface Webhook {
    id: string;
    organizationId: string;
    url: string;
    secret: string;
    events: string[];
    isActive: boolean;
    createdAt: Date;
}
export interface ApiKey {
    id: string;
    organizationId: string;
    name: string;
    keyHash: string;
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    isActive: boolean;
    createdAt: Date;
}
