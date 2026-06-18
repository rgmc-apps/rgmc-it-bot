import express, { Request, Response } from 'express';
import path from 'path';

const port = parseInt(process.env.PORT || '3978', 10);

const app = express();
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, '..', 'static')));

// Lightweight ping — always reachable, no dependencies
app.get('/ping', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Full health check — lazy requires so nothing crashes at startup
app.get('/health', async (_req: Request, res: Response) => {
  const checks: Record<string, { status: 'ok' | 'error'; message?: string }> = {};

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { config } = require('./config') as typeof import('./config');
    checks.bot_credentials = config.botId && config.botPassword
      ? { status: 'ok' }
      : { status: 'error', message: 'BOT_ID or BOT_PASSWORD is missing' };
  } catch (err) {
    checks.bot_credentials = { status: 'error', message: (err as Error).message };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { db } = require('./services/supabase') as typeof import('./services/supabase');
    const { error } = await db.from('bot_subscriptions').select('id').limit(1);
    checks.supabase = error
      ? { status: 'error', message: error.message }
      : { status: 'ok' };
  } catch (err) {
    checks.supabase = { status: 'error', message: (err as Error).message };
  }

  const allOk = Object.values(checks).every(c => c.status === 'ok');
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
});

// Bind the port FIRST so Cloud Run's startup probe passes immediately
app.listen(port, () => {
  console.log(`RGMC IT Bot listening on port ${port}`);
  registerRoutes();
});

// All heavy imports happen after the port is open
function registerRoutes(): void {
  try {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const {
      CloudAdapter,
      ConfigurationBotFrameworkAuthentication,
      ConfigurationServiceClientCredentialFactory,
    } = require('botbuilder');

    const { config } = require('./config') as typeof import('./config');
    const { RgmcItBot } = require('./bot') as typeof import('./bot');
    const { createWebhookRouter } = require('./routes/webhook') as typeof import('./routes/webhook');
    const { createAdminRouter } = require('./routes/admin') as typeof import('./routes/admin');
    /* eslint-enable @typescript-eslint/no-var-requires */

    // Bot Framework adapter
    const credFactory = new ConfigurationServiceClientCredentialFactory({
      MicrosoftAppId: config.botId,
      MicrosoftAppPassword: config.botPassword,
      MicrosoftAppTenantId: config.tenantId || undefined,
      MicrosoftAppType: config.tenantId ? 'SingleTenant' : 'MultiTenant',
    });

    const botAuth = new ConfigurationBotFrameworkAuthentication({}, credFactory);
    const adapter = new CloudAdapter(botAuth);

    adapter.onTurnError = async (context: import('botbuilder').TurnContext, error: Error) => {
      console.error('Bot turn error:', error.message);
      try {
        await context.sendActivity('⚠️ An unexpected error occurred. Please try again.');
      } catch { /* ignore */ }
    };

    const bot = new RgmcItBot();

    // POST /api/messages — Teams → Bot messaging endpoint
    app.post('/api/messages', async (req: Request, res: Response) => {
      await adapter.process(req, res, async (ctx: import('botbuilder').TurnContext) => { await bot.run(ctx); });
    });

    // POST /api/notify, /api/notify/ticket-created, /api/notify/ticket-updated
    app.use('/api/notify', createWebhookRouter(adapter));

    // POST/GET /api/admin/codes, GET /api/admin/subscriptions
    app.use('/api/admin', createAdminRouter());

    console.log('Routes registered:');
    console.log('  POST /api/messages');
    console.log('  POST /api/notify');
    console.log('  POST /api/notify/ticket-created');
    console.log('  POST /api/notify/ticket-updated');
    console.log('  POST /api/admin/codes');
    console.log('  GET  /api/admin/codes');
    console.log('  GET  /api/admin/subscriptions');
    console.log('  GET  /health');
    console.log('  GET  /ping');

  } catch (err) {
    console.error('registerRoutes failed:', (err as Error).message, (err as Error).stack);
  }
}
