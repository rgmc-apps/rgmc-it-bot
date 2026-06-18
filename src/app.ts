import express, { Request, Response } from 'express';
import path from 'path';
import { createHealthRouter } from './routes/health';

const port = parseInt(process.env.PORT || '3978', 10);

const app = express();
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, '..', 'static')));

// Health check is registered before anything else — always reachable
app.use('/health', createHealthRouter());

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

  } catch (err) {
    console.error('registerRoutes failed:', (err as Error).message, (err as Error).stack);
  }
}
