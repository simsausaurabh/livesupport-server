import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { env } from './lib/env.js';
import { redis, getRedis } from './lib/redis.js';

import { authRouter } from './routes/auth.routes.js';
import { conversationsRouter } from './routes/conversations.routes.js';
import { widgetRouter } from './routes/widget.routes.js';
import { analyticsRouter } from './routes/analytics.routes.js';
import { billingRouter } from './routes/billing.routes.js';
import { cannedRouter } from './routes/canned.routes.js';
import { widgetSettingsRouter } from './routes/widget-settings.routes.js';
import { webhooksRouter } from './routes/webhooks.routes.js';
import { chatbotsRouter } from './routes/chatbots.routes.js';
import { knowledgeRouter } from './routes/knowledge.routes.js';

import { initSocketServer } from './socket/index.js';
import { errorHandler, notFound } from './middleware/error.js';

getRedis();

const app = express();
const httpServer = createServer(app);

/* ──────────────────────────────────────────────────────────────
   Security
────────────────────────────────────────────────────────────── */
app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin',
    },
  })
);

app.set('trust proxy', 1);

/* ──────────────────────────────────────────────────────────────
   CORS
   IMPORTANT:
   Widgets are embedded on arbitrary customer domains,
   so origin allowlists are NOT practical here.
────────────────────────────────────────────────────────────── */
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow:
    // - localhost
    // - static HTML files
    // - server-side requests
    // - customer websites
    if (!origin) {
      return callback(null, true);
    }

    return callback(null, true);
  },

  credentials: true,

  methods: [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
  ],

  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-widget-key',
  ],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

/* ──────────────────────────────────────────────────────────────
   Stripe webhook
────────────────────────────────────────────────────────────── */
app.use(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' })
);

/* ──────────────────────────────────────────────────────────────
   Middlewares
────────────────────────────────────────────────────────────── */
app.use(
  morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev')
);

app.use(express.json({ limit: '1mb' }));

app.use(
  express.urlencoded({
    extended: true,
    limit: '1mb',
  })
);

app.use(
  '/api/',
  rateLimit({
    windowMs: 15 * 60_000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

/* ──────────────────────────────────────────────────────────────
   Health
────────────────────────────────────────────────────────────── */
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    ts: new Date().toISOString(),
  });
});

/* ──────────────────────────────────────────────────────────────
   Routes
────────────────────────────────────────────────────────────── */
app.use('/api/auth', authRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/widget', widgetRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/billing', billingRouter);
app.use('/api/canned', cannedRouter);
app.use('/api/widget-settings', widgetSettingsRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/chatbots', chatbotsRouter);
app.use('/api/knowledge', knowledgeRouter);

/* ──────────────────────────────────────────────────────────────
   Errors
────────────────────────────────────────────────────────────── */
app.use(notFound);
app.use(errorHandler);

/* ──────────────────────────────────────────────────────────────
   Socket.IO
────────────────────────────────────────────────────────────── */
const io = initSocketServer(httpServer);

export { app, httpServer, io };

/* ──────────────────────────────────────────────────────────────
   Boot
────────────────────────────────────────────────────────────── */
async function start() {
  try {
    if (redis) {
      await redis.ping();
      console.log('✅ Redis ping successful');
    } else {
      console.warn('⚠️ Redis unavailable');
    }
  } catch (err) {
    console.error('❌ Redis connection failed:', err);
    process.exit(1);
  }

  httpServer.listen(env.PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════╗');
    console.log('║      LiveSupport Server  v1.0       ║');
    console.log('╚══════════════════════════════════════╝');

    console.log(
      `  🚀 HTTP  → http://localhost:${env.PORT}`
    );

    console.log(
      `  🔌 WS    → ws://localhost:${env.PORT}`
    );

    console.log('  🗄️ DB    → MySQL (Prisma)');

    console.log(
      `  ⚡ Cache → Redis ${
        env.REDIS_URL ? 'Connected' : 'Disabled'
      }`
    );

    console.log(`  📍 Env   → ${env.NODE_ENV}`);
    console.log('');
  });

  process.on('SIGTERM', async () => {
    httpServer.close();

    if (redis) {
      await redis.quit();
    }

    process.exit(0);
  });
}

start().catch(console.error);