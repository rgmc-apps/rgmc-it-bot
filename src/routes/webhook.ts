import { Router, Request, Response } from 'express';
import { CloudAdapter } from 'botbuilder';
import { notifyTicketCreated, notifyTicketUpdated } from '../services/notificationService';
import { NotifyTicketPayload } from '../types';
import { config } from '../config';

export function createWebhookRouter(adapter: CloudAdapter): Router {
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
   * POST /api/notify/ticket-created
   * Called by rgmc-gateway when a new ticket is submitted.
   *
   * Body: { event: "ticket.created", ticket: Ticket }
   */
  router.post('/ticket-created', async (req: Request, res: Response) => {
    const payload = req.body as NotifyTicketPayload;
    if (!payload?.ticket) {
      res.status(400).json({ error: 'Missing ticket in payload' });
      return;
    }
    try {
      await notifyTicketCreated(payload.ticket, adapter);
      res.json({ success: true, message: 'Notification dispatched' });
    } catch (err) {
      console.error('ticket-created notify error:', err);
      res.status(500).json({ error: 'Failed to dispatch notification' });
    }
  });

  /**
   * POST /api/notify/ticket-updated
   * Called by rgmc-gateway when a ticket is updated (status, assignee, etc.).
   *
   * Body: { event: "ticket.updated", ticket: Ticket, changes: TicketChanges }
   */
  router.post('/ticket-updated', async (req: Request, res: Response) => {
    const payload = req.body as NotifyTicketPayload;
    if (!payload?.ticket) {
      res.status(400).json({ error: 'Missing ticket in payload' });
      return;
    }
    try {
      await notifyTicketUpdated(payload.ticket, payload.changes || {}, adapter);
      res.json({ success: true, message: 'Notification dispatched' });
    } catch (err) {
      console.error('ticket-updated notify error:', err);
      res.status(500).json({ error: 'Failed to dispatch notification' });
    }
  });

  /**
   * POST /api/notify
   * Unified endpoint — dispatches based on payload.event field.
   *
   * Body: NotifyTicketPayload (event + ticket + optional changes)
   */
  router.post('/', async (req: Request, res: Response) => {
    const payload = req.body as NotifyTicketPayload;
    if (!payload?.ticket || !payload?.event) {
      res.status(400).json({ error: 'Missing event or ticket in payload' });
      return;
    }
    try {
      if (payload.event === 'ticket.created') {
        await notifyTicketCreated(payload.ticket, adapter);
      } else if (payload.event === 'ticket.updated') {
        await notifyTicketUpdated(payload.ticket, payload.changes || {}, adapter);
      } else {
        res.status(400).json({ error: `Unknown event: ${payload.event}` });
        return;
      }
      res.json({ success: true, message: 'Notification dispatched' });
    } catch (err) {
      console.error('notify error:', err);
      res.status(500).json({ error: 'Failed to dispatch notification' });
    }
  });

  return router;
}
