import { Plan } from './enums.js';

export interface PlanLimits {
  maxAgents:               number;   // -1 = unlimited
  monthlyVisitors:         number;
  monthlyConversations:    number;
  chatHistoryMonths:       number;
  maxChatbots:             number;
  maxKnowledgeSources:     number;
  yearlyDiscountPct:       number;   // 20 = 20% off
  aiReplySuggestions:      boolean;
  aiChatSummary:           boolean;
  aiAutoTagging:           boolean;
  aiBotMode:               boolean;
  aiKnowledgeBase:         boolean;
  humanHandoff:            boolean;
  customAiPersona:         boolean;
  customLogo:              boolean;
  removeBranding:          boolean;
  cannedResponses:         boolean;
  analyticsBasic:          boolean;
  analyticsAdvanced:       boolean;
  agentRatings:            boolean;
  webhooks:                boolean;
  apiAccess:               boolean;
  customRoles:             boolean;
  slaReports:              boolean;
  fileAttachments:         boolean;
  exportData:              boolean;
  proactiveGreeting:       boolean;
  periodicCheckin:         boolean;
  widgetAdvancedStyles:    boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  [Plan.FREE]: {
    maxAgents: 1, monthlyVisitors: 500, monthlyConversations: 250,
    chatHistoryMonths: 3, maxChatbots: 0, maxKnowledgeSources: 0,
    yearlyDiscountPct: 20,
    aiReplySuggestions: false, aiChatSummary: false, aiAutoTagging: false,
    aiBotMode: false, aiKnowledgeBase: false, humanHandoff: false,
    customAiPersona: false, customLogo: false,
    removeBranding: false, cannedResponses: false,
    analyticsBasic: true, analyticsAdvanced: false, agentRatings: false,
    webhooks: false, apiAccess: false, customRoles: false,
    slaReports: false, fileAttachments: false, exportData: false,
    proactiveGreeting: true, periodicCheckin: true, widgetAdvancedStyles: false,
  },
  [Plan.STARTER]: {
    maxAgents: 3, monthlyVisitors: 2000, monthlyConversations: 2500,
    chatHistoryMonths: 6, maxChatbots: 1, maxKnowledgeSources: 5,
    yearlyDiscountPct: 20,
    aiReplySuggestions: true, aiChatSummary: true, aiAutoTagging: true,
    aiBotMode: true, aiKnowledgeBase: true, humanHandoff: true,
    customAiPersona: false, customLogo: true,
    removeBranding: false, cannedResponses: true,
    analyticsBasic: true, analyticsAdvanced: false, agentRatings: true,
    webhooks: false, apiAccess: false, customRoles: false,
    slaReports: false, fileAttachments: true, exportData: false,
    proactiveGreeting: true, periodicCheckin: true, widgetAdvancedStyles: true,
  },
  [Plan.TEAM]: {
    maxAgents: 10, monthlyVisitors: 10000, monthlyConversations: 2500,
    chatHistoryMonths: 12, maxChatbots: 10, maxKnowledgeSources: 25,
    yearlyDiscountPct: 20,
    aiReplySuggestions: true, aiChatSummary: true, aiAutoTagging: true,
    aiBotMode: true, aiKnowledgeBase: true, humanHandoff: true,
    customAiPersona: true, customLogo: true,
    removeBranding: true, cannedResponses: true,
    analyticsBasic: true, analyticsAdvanced: true, agentRatings: true,
    webhooks: true, apiAccess: false, customRoles: false,
    slaReports: false, fileAttachments: true, exportData: true,
    proactiveGreeting: true, periodicCheckin: true, widgetAdvancedStyles: true,
  },
  [Plan.BUSINESS]: {
    maxAgents: -1, monthlyVisitors: -1, monthlyConversations: 2500,
    chatHistoryMonths: 24, maxChatbots: 50, maxKnowledgeSources: 200,
    yearlyDiscountPct: 20,
    aiReplySuggestions: true, aiChatSummary: true, aiAutoTagging: true,
    aiBotMode: true, aiKnowledgeBase: true, humanHandoff: true,
    customAiPersona: true, customLogo: true,
    removeBranding: true, cannedResponses: true,
    analyticsBasic: true, analyticsAdvanced: true, agentRatings: true,
    webhooks: true, apiAccess: true, customRoles: true,
    slaReports: true, fileAttachments: true, exportData: true,
    proactiveGreeting: true, periodicCheckin: true, widgetAdvancedStyles: true,
  },
};

export function getPlanLimits(plan: Plan): PlanLimits { return PLAN_LIMITS[plan]; }
export function canUseFeature(plan: Plan, feature: keyof PlanLimits): boolean {
  const v = PLAN_LIMITS[plan][feature];
  return typeof v === 'boolean' ? v : (v as number) !== 0 && (v as number) !== -1 || v === -1;
}
