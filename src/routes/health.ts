import { Router, Request, Response } from 'express';
import { config } from '../config';
import { db } from '../services/supabase';

export function createHealthRouter(): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response) => {
    const checks: Record<string, { status: 'ok' | 'error'; message?: string }> = {};

    // Bot credentials
    checks.bot_credentials = config.botId && config.botPassword
      ? { status: 'ok' }
      : { status: 'error', message: 'BOT_ID or BOT_PASSWORD is missing' };

    // Supabase connectivity
    try {
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

  return router;
}
