export enum Plan {
  FREE     = 'FREE',
  STARTER  = 'STARTER',
  TEAM     = 'TEAM',
  BUSINESS = 'BUSINESS',
}

export enum AgentRole {
  OWNER  = 'OWNER',
  ADMIN  = 'ADMIN',
  AGENT  = 'AGENT',
  VIEWER = 'VIEWER',
}

export enum AgentStatus {
  ONLINE  = 'ONLINE',
  AWAY    = 'AWAY',
  OFFLINE = 'OFFLINE',
}

export enum ConversationStatus {
  OPEN      = 'OPEN',
  ASSIGNED  = 'ASSIGNED',
  RESOLVED  = 'RESOLVED',
  ABANDONED = 'ABANDONED',
}

export enum MessageSenderType {
  VISITOR = 'VISITOR',
  AGENT   = 'AGENT',
  BOT     = 'BOT',
  SYSTEM  = 'SYSTEM',
}
