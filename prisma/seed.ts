// Run: npm run db:seed
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEFAULT_WIDGET_SETTINGS = {
  primaryColor: '#0f172a',
  textColor: '#ffffff',
  logoUrl: null,
  brandName: 'Demo Support',
  greetingMessage: 'Hi! How can we help you today?',
  offlineMessage: "We're offline right now. Leave us a message!",
  launcherPosition: 'bottom-right',
  language: 'en',
  showAgentAvatar: true,
  collectEmailBeforeChat: false,
};

async function main() {
  console.log('🌱 Seeding database...\n');

  // ── Organization ──────────────────────────────
  const org = await prisma.organization.upsert({
    where: { slug: 'demo-company' },
    update: {},
    create: {
      name: 'Demo Company',
      slug: 'demo-company',
      plan: 'TEAM',
      widgetKey: 'demo-widget-key-12345',
      widgetSettingsJson: JSON.stringify(DEFAULT_WIDGET_SETTINGS),
      monthlyVisitorLimit: 2000,
      chatHistoryMonths: 8,
      maxAgents: 10,
    },
  });
  console.log(`✅ Organization: ${org.name} (${org.id})`);

  // ── Owner ─────────────────────────────────────
  const ownerHash = await bcrypt.hash('password123', 12);
  const owner = await prisma.agent.upsert({
    where: { organizationId_email: { organizationId: org.id, email: 'owner@demo.com' } },
    update: {},
    create: {
      organizationId: org.id,
      email: 'owner@demo.com',
      name: 'Alex Owner',
      passwordHash: ownerHash,
      role: 'OWNER',
      status: 'ONLINE',
      ratingAvg: 4.8,
      ratingCount: 42,
    },
  });

  // ── Agent ─────────────────────────────────────
  const agentHash = await bcrypt.hash('password123', 12);
  const agent = await prisma.agent.upsert({
    where: { organizationId_email: { organizationId: org.id, email: 'agent@demo.com' } },
    update: {},
    create: {
      organizationId: org.id,
      email: 'agent@demo.com',
      name: 'Sam Agent',
      passwordHash: agentHash,
      role: 'AGENT',
      status: 'ONLINE',
      ratingAvg: 4.5,
      ratingCount: 18,
    },
  });
  console.log(`✅ Agents: ${owner.email}, ${agent.email}`);

  // ── Tags ──────────────────────────────────────
  const tagDefs = [
    { name: 'billing',   color: '#ef4444', isAutoApplied: true  },
    { name: 'technical', color: '#3b82f6', isAutoApplied: true  },
    { name: 'sales',     color: '#22c55e', isAutoApplied: true  },
    { name: 'general',   color: '#a855f7', isAutoApplied: true  },
    { name: 'urgent',    color: '#f97316', isAutoApplied: false },
  ];
  for (const t of tagDefs) {
    await prisma.tag.upsert({
      where: { organizationId_name: { organizationId: org.id, name: t.name } },
      update: {},
      create: { organizationId: org.id, ...t },
    });
  }
  console.log('✅ Tags created');

  // ── Canned responses ──────────────────────────
  const canned = [
    { shortcut: '/hello', title: 'Greeting',      content: "Hi there! 👋 Welcome to Demo Support. How can I help you today?" },
    { shortcut: '/bye',   title: 'Goodbye',       content: "Thanks for reaching out! Have a great day! 😊" },
    { shortcut: '/wait',  title: 'Please Wait',   content: "Give me just a moment, I'm looking into that for you." },
    { shortcut: '/email', title: 'Request Email', content: "Could you share your email address so I can follow up directly?" },
  ];
  for (const cr of canned) {
    await prisma.cannedResponse.upsert({
      where: { organizationId_shortcut: { organizationId: org.id, shortcut: cr.shortcut } },
      update: {},
      create: { organizationId: org.id, ...cr, createdByAgentId: owner.id },
    });
  }
  console.log('✅ Canned responses created');

  // ── Sample visitor + conversation ─────────────
  const visitor = await prisma.visitor.upsert({
    where: { organizationId_fingerprint: { organizationId: org.id, fingerprint: 'seed-fp-001' } },
    update: {},
    create: {
      organizationId: org.id,
      fingerprint: 'seed-fp-001',
      email: 'visitor@example.com',
      name: 'John Visitor',
      browserName: 'Chrome',
      osName: 'macOS',
      country: 'IN',
      city: 'Bengaluru',
      customDataJson: '{}',
    },
  });

  const conversation = await prisma.conversation.create({
    data: {
      organizationId: org.id,
      visitorId: visitor.id,
      assignedAgentId: agent.id,
      status: 'RESOLVED',
      aiSummary: 'Visitor asked about Team plan pricing. Agent explained features and annual discount.',
      rating: 5,
      durationSeconds: 342,
      firstResponseSeconds: 28,
      messageCount: 3,
      resolvedAt: new Date(),
    },
  });

  await prisma.message.createMany({
    data: [
      { conversationId: conversation.id, senderType: 'VISITOR', content: 'Hi, I have a question about pricing', createdAt: new Date(Date.now() - 300000) },
      { conversationId: conversation.id, senderType: 'AGENT', senderId: agent.id, content: "Happy to help with pricing! What would you like to know?", isAiSuggested: true, createdAt: new Date(Date.now() - 270000) },
      { conversationId: conversation.id, senderType: 'VISITOR', content: 'What is included in the Team plan?', createdAt: new Date(Date.now() - 240000) },
    ],
  });

  console.log('✅ Sample conversation created\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🔑 Widget key:   demo-widget-key-12345');
  console.log('  📧 Owner login:  owner@demo.com / password123');
  console.log('  📧 Agent login:  agent@demo.com / password123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
