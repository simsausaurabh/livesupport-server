-- CreateTable
CREATE TABLE `organizations` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `domain` VARCHAR(255) NULL,
    `plan` ENUM('FREE', 'STARTER', 'TEAM', 'BUSINESS') NOT NULL DEFAULT 'FREE',
    `billingCycle` VARCHAR(10) NOT NULL DEFAULT 'monthly',
    `stripeCustomerId` VARCHAR(100) NULL,
    `stripeSubscriptionId` VARCHAR(100) NULL,
    `trialEndsAt` DATETIME(3) NULL,
    `billingEmail` VARCHAR(255) NULL,
    `widgetKey` VARCHAR(100) NOT NULL,
    `widget_settings` TEXT NOT NULL,
    `monthlyVisitorLimit` INTEGER NOT NULL DEFAULT 1000,
    `monthlyConvLimit` INTEGER NOT NULL DEFAULT 250,
    `chatHistoryMonths` INTEGER NOT NULL DEFAULT 6,
    `maxAgents` INTEGER NOT NULL DEFAULT 1,
    `maxChatbots` INTEGER NOT NULL DEFAULT 0,
    `currentMonthVisitors` INTEGER NOT NULL DEFAULT 0,
    `currentMonthConvs` INTEGER NOT NULL DEFAULT 0,
    `visitorCountResetAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `organizations_slug_key`(`slug`),
    UNIQUE INDEX `organizations_stripeCustomerId_key`(`stripeCustomerId`),
    UNIQUE INDEX `organizations_stripeSubscriptionId_key`(`stripeSubscriptionId`),
    UNIQUE INDEX `organizations_widgetKey_key`(`widgetKey`),
    INDEX `organizations_widgetKey_idx`(`widgetKey`),
    INDEX `organizations_slug_idx`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agents` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `passwordHash` VARCHAR(255) NULL,
    `avatarUrl` VARCHAR(500) NULL,
    `role` ENUM('OWNER', 'ADMIN', 'AGENT', 'VIEWER') NOT NULL DEFAULT 'AGENT',
    `status` ENUM('ONLINE', 'AWAY', 'OFFLINE') NOT NULL DEFAULT 'OFFLINE',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `googleId` VARCHAR(100) NULL,
    `ratingAvg` DOUBLE NOT NULL DEFAULT 0,
    `ratingCount` INTEGER NOT NULL DEFAULT 0,
    `lastSeenAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `agents_googleId_key`(`googleId`),
    INDEX `agents_organizationId_idx`(`organizationId`),
    INDEX `agents_email_idx`(`email`),
    UNIQUE INDEX `agents_organizationId_email_key`(`organizationId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agent_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `token` VARCHAR(512) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `agent_sessions_token_key`(`token`),
    INDEX `agent_sessions_agentId_idx`(`agentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `visitors` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `fingerprint` VARCHAR(200) NOT NULL,
    `email` VARCHAR(255) NULL,
    `name` VARCHAR(150) NULL,
    `ipAddress` VARCHAR(45) NULL,
    `country` VARCHAR(2) NULL,
    `city` VARCHAR(100) NULL,
    `browserName` VARCHAR(100) NULL,
    `osName` VARCHAR(100) NULL,
    `currentUrl` VARCHAR(2000) NULL,
    `referrer` VARCHAR(2000) NULL,
    `custom_data` TEXT NOT NULL,
    `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL,

    INDEX `visitors_organizationId_idx`(`organizationId`),
    INDEX `visitors_fingerprint_idx`(`fingerprint`),
    UNIQUE INDEX `visitors_organizationId_fingerprint_key`(`organizationId`, `fingerprint`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversations` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `visitorId` VARCHAR(191) NOT NULL,
    `assignedAgentId` VARCHAR(191) NULL,
    `chatbotId` VARCHAR(191) NULL,
    `status` ENUM('OPEN', 'ASSIGNED', 'BOT', 'RESOLVED', 'ABANDONED') NOT NULL DEFAULT 'OPEN',
    `subject` VARCHAR(255) NULL,
    `aiSummary` TEXT NULL,
    `botHandedOff` BOOLEAN NOT NULL DEFAULT false,
    `handoffReason` VARCHAR(500) NULL,
    `rating` INTEGER NULL,
    `ratingComment` VARCHAR(1000) NULL,
    `durationSeconds` INTEGER NULL,
    `firstResponseSeconds` INTEGER NULL,
    `messageCount` INTEGER NOT NULL DEFAULT 0,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `conversations_organizationId_idx`(`organizationId`),
    INDEX `conversations_visitorId_idx`(`visitorId`),
    INDEX `conversations_assignedAgentId_idx`(`assignedAgentId`),
    INDEX `conversations_status_idx`(`status`),
    INDEX `conversations_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `messages` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `senderType` ENUM('VISITOR', 'AGENT', 'BOT', 'SYSTEM') NOT NULL,
    `senderId` VARCHAR(191) NULL,
    `content` TEXT NOT NULL,
    `contentType` VARCHAR(20) NOT NULL DEFAULT 'text',
    `isAiSuggested` BOOLEAN NOT NULL DEFAULT false,
    `isInternalNote` BOOLEAN NOT NULL DEFAULT false,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `messages_conversationId_idx`(`conversationId`),
    INDEX `messages_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tags` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `color` VARCHAR(7) NOT NULL DEFAULT '#3b82f6',
    `isAutoApplied` BOOLEAN NOT NULL DEFAULT false,

    INDEX `tags_organizationId_idx`(`organizationId`),
    UNIQUE INDEX `tags_organizationId_name_key`(`organizationId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversation_tags` (
    `conversationId` VARCHAR(191) NOT NULL,
    `tagId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`conversationId`, `tagId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `canned_responses` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `shortcut` VARCHAR(50) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `content` TEXT NOT NULL,
    `createdByAgentId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `canned_responses_organizationId_idx`(`organizationId`),
    UNIQUE INDEX `canned_responses_organizationId_shortcut_key`(`organizationId`, `shortcut`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `knowledge_sources` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `type` ENUM('URL', 'FILE', 'MANUAL') NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `sourceUrl` VARCHAR(2000) NULL,
    `fileName` VARCHAR(255) NULL,
    `contentText` LONGTEXT NOT NULL,
    `isIndexed` BOOLEAN NOT NULL DEFAULT false,
    `charCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `knowledge_sources_organizationId_idx`(`organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chatbots` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `persona` TEXT NOT NULL,
    `welcomeMessage` VARCHAR(500) NOT NULL,
    `handoffMessage` VARCHAR(500) NOT NULL,
    `handoffTriggers` TEXT NOT NULL,
    `status` ENUM('ACTIVE', 'PAUSED', 'DRAFT') NOT NULL DEFAULT 'DRAFT',
    `autoHandoff` BOOLEAN NOT NULL DEFAULT true,
    `handoffKeywords` TEXT NOT NULL,
    `totalChats` INTEGER NOT NULL DEFAULT 0,
    `handoffCount` INTEGER NOT NULL DEFAULT 0,
    `resolutionCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `chatbots_organizationId_idx`(`organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chatbot_knowledge` (
    `chatbotId` VARCHAR(191) NOT NULL,
    `knowledgeSourceId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`chatbotId`, `knowledgeSourceId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agent_ratings` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `score` INTEGER NOT NULL,
    `comment` VARCHAR(1000) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `agent_ratings_conversationId_key`(`conversationId`),
    INDEX `agent_ratings_agentId_idx`(`agentId`),
    INDEX `agent_ratings_organizationId_idx`(`organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webhooks` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `url` VARCHAR(2000) NOT NULL,
    `secret` VARCHAR(255) NOT NULL,
    `events` TEXT NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastTriggeredAt` DATETIME(3) NULL,
    `failureCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `webhooks_organizationId_idx`(`organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webhook_deliveries` (
    `id` VARCHAR(191) NOT NULL,
    `webhookId` VARCHAR(191) NOT NULL,
    `event` VARCHAR(100) NOT NULL,
    `payload` TEXT NOT NULL,
    `statusCode` INTEGER NULL,
    `response` TEXT NULL,
    `success` BOOLEAN NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `webhook_deliveries_webhookId_idx`(`webhookId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `api_keys` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `keyHash` VARCHAR(255) NOT NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `api_keys_keyHash_key`(`keyHash`),
    INDEX `api_keys_organizationId_idx`(`organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `agents` ADD CONSTRAINT `agents_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agent_sessions` ADD CONSTRAINT `agent_sessions_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `visitors` ADD CONSTRAINT `visitors_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_visitorId_fkey` FOREIGN KEY (`visitorId`) REFERENCES `visitors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_assignedAgentId_fkey` FOREIGN KEY (`assignedAgentId`) REFERENCES `agents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_chatbotId_fkey` FOREIGN KEY (`chatbotId`) REFERENCES `chatbots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `agents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tags` ADD CONSTRAINT `tags_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversation_tags` ADD CONSTRAINT `conversation_tags_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversation_tags` ADD CONSTRAINT `conversation_tags_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `tags`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `canned_responses` ADD CONSTRAINT `canned_responses_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `canned_responses` ADD CONSTRAINT `canned_responses_createdByAgentId_fkey` FOREIGN KEY (`createdByAgentId`) REFERENCES `agents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `knowledge_sources` ADD CONSTRAINT `knowledge_sources_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chatbots` ADD CONSTRAINT `chatbots_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chatbot_knowledge` ADD CONSTRAINT `chatbot_knowledge_chatbotId_fkey` FOREIGN KEY (`chatbotId`) REFERENCES `chatbots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chatbot_knowledge` ADD CONSTRAINT `chatbot_knowledge_knowledgeSourceId_fkey` FOREIGN KEY (`knowledgeSourceId`) REFERENCES `knowledge_sources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agent_ratings` ADD CONSTRAINT `agent_ratings_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agent_ratings` ADD CONSTRAINT `agent_ratings_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `webhooks` ADD CONSTRAINT `webhooks_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `webhook_deliveries` ADD CONSTRAINT `webhook_deliveries_webhookId_fkey` FOREIGN KEY (`webhookId`) REFERENCES `webhooks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `api_keys` ADD CONSTRAINT `api_keys_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
