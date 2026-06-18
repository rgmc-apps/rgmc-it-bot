import express, { Request, Response } from 'express';
import path from 'path';
import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  ConfigurationServiceClientCredentialFactory,
  TurnContext,
} from 'botbuilder';
import { config } from './config';
import { RgmcItBot } from './bot';
import { createWebhookRouter } from './routes/webhook';
import { createAdminRouter } from './routes/admin';

const app = express();
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, '..', 'static')));

// Health check is always available — Cloud Run startup probe hits this
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Bind the port immediately so Cloud Run's startup probe passes
app.listen(config.port, () => {
  console.log(`RGMC IT Bot listening on port ${config.port}`);
  initializeBot();
});

function initializeBot(): void {
  try {
    // ─── Bot Framework adapter ─────────────────────────────────────────────────
    const credFactory = new ConfigurationServiceClientCredentialFactory({
      MicrosoftAppId: config.botId,
      MicrosoftAppPassword: config.botPassword,
      MicrosoftAppTenantId: config.tenantId || undefined,
      MicrosoftAppType: config.tenantId ? 'SingleTenant' : 'MultiTenant',
    });

    const botAuth = new ConfigurationBotFrameworkAuthentication({}, credFactory);
    const adapter = new CloudAdapter(botAuth);

    adapter.onTurnError = async (context: TurnContext, error: Error) => {
      console.error('Bot turn error:', error.message, error.stack);
      try {
        await context.sendActivity('⚠️ An unexpected error occurred. Please try again.');
      } catch {
        // ignore
      }
    };

    const bot = new RgmcItBot();

    /**
     * POST /api/messages
     * Bot Framework / Teams → Bot messaging endpoint.
     * Must match the Messaging Endpoint set in the Azure Bot resource.
     */
    app.post('/api/messages', async (req: Request, res: Response) => {
      await adapter.process(req, res, async (context) => {
        await bot.run(context);
      });
    });

    /**
     * POST /api/notify            — unified event dispatch
     * POST /api/notify/ticket-created
     * POST /api/notify/ticket-updated
     * All secured with X-API-Key header.
     */
    app.use('/api/notify', createWebhookRouter(adapter));

    /**
     * POST /api/admin/codes       — generate a channel registration code
     * GET  /api/admin/codes       — list all registration codes
     * GET  /api/admin/subscriptions — list registered channels
     * Secured with X-API-Key header.
     */
    app.use('/api/admin', createAdminRouter());

    console.log('Bot initialized successfully');
    console.log('  Messaging endpoint : POST /api/messages');
    console.log('  Ticket created     : POST /api/notify/ticket-created');
    console.log('  Ticket updated     : POST /api/notify/ticket-updated');
    console.log('  Unified notify     : POST /api/notify');
    console.log('  Admin codes        : POST/GET /api/admin/codes');
    console.log('  Subscriptions      : GET /api/admin/subscriptions');
  } catch (err) {
    console.error('Bot initialization error:', (err as Error).message);
  }
}
