import { Router, Request, Response } from 'express';
import { createRegistrationCode, listRegistrationCodes, getAllSubscriptions } from '../services/supabase';
import { config } from '../config';

export function createAdminRouter(): Router {
  const router = Router();

  router.use((req: Request, res: Response, next) => {
    const key = req.headers['x-api-key'] as string | undefined;
    if (!key || key !== config.webhookApiKey) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  });

  /**
   * POST /api/admin/codes
   * Generate a new channel registration code.
   *
   * Body: { label?: string }
   */
  router.post('/codes', async (req: Request, res: Response) => {
    const { label } = req.body as { label?: string };
    const code = await createRegistrationCode(label || null);
    if (!code) {
      res.status(500).json({ error: 'Failed to generate code' });
      return;
    }
    res.status(201).json(code);
  });

  /**
   * GET /api/admin/codes
   * List all registration codes.
   */
  router.get('/codes', async (_req: Request, res: Response) => {
    const codes = await listRegistrationCodes();
    res.json(codes);
  });

  /**
   * GET /api/admin/subscriptions
   * List all registered channels.
   */
  router.get('/subscriptions', async (_req: Request, res: Response) => {
    const subs = await getAllSubscriptions();
    res.json(
      subs.map((s) => ({
        id: s.id,
        channel_id: s.channel_id,
        channel_name: s.channel_name,
        team_id: s.team_id,
        registration_code: s.registration_code,
        priority_filter: s.priority_filter,
        type_filter: s.type_filter,
        notify_created: s.notify_created,
        notify_updated: s.notify_updated,
        notify_resolved: s.notify_resolved,
        created_at: s.created_at,
      }))
    );
  });

  return router;
}
